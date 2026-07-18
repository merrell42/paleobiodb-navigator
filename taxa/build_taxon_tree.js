/**
 * Compress pbdb_data.csv into parent/child links by taxon name.
 *
 * Usage:
 *   node build_taxon_tree.js [--fetch-common-names]
 *
 * Input:
 *   taxa/pbdb_data.csv — PBDB taxonomy export (see taxa/README.md)
 *
 * Output:
 *   taxa/taxon_tree.json
 *
 * Output format:
 *   {
 *     "<taxon_name>": [
 *       <parent_name|null>,
 *       [<child_name>, ...],
 *       <common_name|null>,
 *       <total_occurrences>
 *     ],
 *     ...
 *   }
 *
 * total_occurrences is n_occs from the CSV for leaf nodes (no children in the
 * tree). For parent nodes it is the sum of total_occurrences across children.
 *
 * Common names are read from a common_name column in pbdb_data.csv when present.
 * If taxa/common_names.json exists, those entries are merged in as well.
 * Pass --fetch-common-names to download missing names from the PBDB API and
 * refresh common_names.json (batched requests). Only taxa with at least
 * MIN_OCCURRENCES_FOR_COMMON_NAMES total occurrences are queried.
 */

var fs = require("fs");
var http = require("http");
var https = require("https");
var path = require("path");

var INPUT = path.join(__dirname, "pbdb_data.csv");
var OUTPUT = path.join(__dirname, "taxon_tree.json");
var COMMON_NAMES_CACHE = path.join(__dirname, "common_names.json");
var PBDB_HOST = "paleobiodb.org";
var PBDB_BATCH_SIZE = 200;
var MIN_OCCURRENCES_FOR_COMMON_NAMES = 100;

function parseCSVLine(line) {
  var fields = [];
  var current = "";
  var inQuotes = false;

  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function toInt(value) {
  if (!value) return null;
  var n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}

function parseHeader(line) {
  return parseCSVLine(line).map(function (field) {
    return field.replace(/^"|"$/g, "");
  });
}

function columnMap(header) {
  var columns = {};
  header.forEach(function (name, index) {
    columns[name] = index;
  });
  return columns;
}

function field(row, columns, name) {
  if (!columns.hasOwnProperty(name)) {
    return "";
  }
  return row[columns[name]] || "";
}

function scoreRow(difference, taxonName, acceptedName, taxonNo, acceptedNo, parentNo) {
  var score = 0;
  if (!difference) score += 4;
  if (taxonName === acceptedName) score += 4;
  if (toInt(taxonNo) === acceptedNo) score += 2;
  if (parentNo && parentNo !== acceptedNo) score += 1;
  return score;
}

function loadCommonNamesCache() {
  if (!fs.existsSync(COMMON_NAMES_CACHE)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(COMMON_NAMES_CACHE, "utf8"));
  } catch (err) {
    console.warn("Could not read " + COMMON_NAMES_CACHE + ": " + err.message);
    return {};
  }
}

function saveCommonNamesCache(cache) {
  fs.writeFileSync(COMMON_NAMES_CACHE, JSON.stringify(cache));
}

function fetchJson(url) {
  return new Promise(function (resolve, reject) {
    var client = url.indexOf("https:") === 0 ? https : http;
    var requestUrl = url.indexOf("https:") === 0 || url.indexOf("http:") === 0
      ? url
      : "https://" + PBDB_HOST + url;

    client.get(requestUrl, {
      headers: {
        "User-Agent": "PBDB-Navigator/1.0"
      }
    }, function (res) {
      var body = "";
      res.setEncoding("utf8");
      res.on("data", function (chunk) {
        body += chunk;
      });
      res.on("end", function () {
        if (res.statusCode !== 200) {
          return reject(new Error("HTTP " + res.statusCode + " for " + url));
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    }).on("error", reject);
  });
}

function fetchCommonNames(ids, cache) {
  var missing = ids.filter(function (id) {
    return !cache.hasOwnProperty(String(id));
  });

  if (!missing.length) {
    return Promise.resolve(cache);
  }

  console.log("Fetching common names for " + missing.length + " taxa from PBDB...");

  var chain = Promise.resolve();
  var batchCount = Math.ceil(missing.length / PBDB_BATCH_SIZE);

  for (var i = 0; i < missing.length; i += PBDB_BATCH_SIZE) {
    (function (start, batchIndex) {
      chain = chain.then(function () {
        var batch = missing.slice(start, start + PBDB_BATCH_SIZE);
        console.log("  batch " + (batchIndex + 1) + " / " + batchCount);
        var idParam = batch.map(function (id) {
          return "txn:" + id;
        }).join(",");
        var url = "https://" + PBDB_HOST + "/data1.2/taxa/list.json?id=" + encodeURIComponent(idParam) + "&show=common";

        return fetchJson(url).then(function (data) {
          (data.records || []).forEach(function (record) {
            var id = String(parseInt(String(record.oid).replace(/^txn:/, ""), 10));
            cache[id] = record.nm2 || null;
          });

          batch.forEach(function (id) {
            var key = String(id);
            if (!cache.hasOwnProperty(key)) {
              cache[key] = null;
            }
          });
        });
      });
    })(i, i / PBDB_BATCH_SIZE);
  }

  return chain.then(function () {
    saveCommonNamesCache(cache);
    return cache;
  });
}

function computeTotalOccurrences(id, childrenById, occsById, memo) {
  if (memo.hasOwnProperty(id)) {
    return memo[id];
  }

  var kids = childrenById[id] || [];
  var total;

  if (!kids.length) {
    total = occsById[id] || 0;
  } else {
    total = kids.reduce(function (sum, childId) {
      return sum + computeTotalOccurrences(childId, childrenById, occsById, memo);
    }, 0);
  }

  memo[id] = total;
  return total;
}

function buildTree(options) {
  options = options || {};
  var fetchCommonNames = !!options.fetchCommonNames;

  var text = fs.readFileSync(INPUT, "utf8");
  var lines = text.split(/\r?\n/);
  var header = parseHeader(lines[0]);
  var columns = columnMap(header);
  var required = ["taxon_no", "taxon_name", "difference", "accepted_no", "accepted_name", "parent_no", "n_occs"];
  required.forEach(function (name) {
    if (!columns.hasOwnProperty(name)) {
      throw new Error("pbdb_data.csv is missing required column: " + name);
    }
  });
  var parents = {};
  var names = {};
  var rowScore = {};
  var occsById = {};
  var commonById = {};
  var commonNamesCache = loadCommonNamesCache();

  Object.keys(commonNamesCache).forEach(function (idStr) {
    commonById[parseInt(idStr, 10)] = commonNamesCache[idStr] || null;
  });

  for (var i = 1; i < lines.length; i++) {
    var line = lines[i];
    if (!line) continue;

    var row = parseCSVLine(line);
    var taxonNo = field(row, columns, "taxon_no");
    var taxonName = field(row, columns, "taxon_name");
    var difference = field(row, columns, "difference");
    var acceptedNo = toInt(field(row, columns, "accepted_no"));
    var acceptedName = field(row, columns, "accepted_name");
    var parentNo = toInt(field(row, columns, "parent_no"));
    var parentName = field(row, columns, "parent_name");
    var nOccs = toInt(field(row, columns, "n_occs")) || 0;
    var commonName = field(row, columns, "common_name") || null;

    if (!acceptedNo || !acceptedName) continue;
    if (parentNo === acceptedNo) continue;

    var score = scoreRow(difference, taxonName, acceptedName, taxonNo, acceptedNo, parentNo);
    if (rowScore[acceptedNo] && rowScore[acceptedNo] > score) continue;

    rowScore[acceptedNo] = score;
    parents[acceptedNo] = parentNo;
    names[acceptedNo] = acceptedName;
    occsById[acceptedNo] = nOccs;

    if (commonName) {
      commonById[acceptedNo] = commonName;
      commonNamesCache[String(acceptedNo)] = commonName;
    }

    if (parentNo && parentNo !== acceptedNo) {
      if (!parents.hasOwnProperty(parentNo)) {
        parents[parentNo] = null;
      }
      if (parentName && !names[parentNo]) {
        names[parentNo] = parentName;
      }
    }
  }

  var childrenById = {};
  Object.keys(parents).forEach(function (idStr) {
    var id = parseInt(idStr, 10);
    var parent = parents[id];
    if (!parent || parent === id) return;
    if (!childrenById[parent]) childrenById[parent] = [];
    childrenById[parent].push(id);
  });

  var totalOccMemo = {};
  Object.keys(parents).forEach(function (idStr) {
    computeTotalOccurrences(parseInt(idStr, 10), childrenById, occsById, totalOccMemo);
  });

  var tree = {};
  Object.keys(parents).forEach(function (idStr) {
    var id = parseInt(idStr, 10);
    var name = names[id];
    if (!name) return;

    var parentId = parents[id] || null;
    var parentName = parentId ? names[parentId] : null;
    var kids = (childrenById[id] || [])
      .map(function (childId) { return names[childId]; })
      .filter(Boolean)
      .sort();

    tree[name] = [
      parentName,
      kids,
      commonById[id] || null,
      totalOccMemo[id] || 0
    ];
  });

  return {
    tree: tree,
    ids: Object.keys(parents).map(function (idStr) { return parseInt(idStr, 10); }),
    idsForCommonNames: Object.keys(parents)
      .map(function (idStr) { return parseInt(idStr, 10); })
      .filter(function (id) { return totalOccMemo[id] >= MIN_OCCURRENCES_FOR_COMMON_NAMES; }),
    commonNamesCache: commonNamesCache
  };
}

function main() {
  var shouldFetchCommonNames = process.argv.indexOf("--fetch-common-names") >= 0;
  console.log("Reading " + INPUT + "...");

  var result = buildTree({ fetchCommonNames: shouldFetchCommonNames });
  var tree = result.tree;
  var nodeCount = Object.keys(tree).length;

  function writeOutput() {
    fs.writeFileSync(OUTPUT, JSON.stringify(tree));

    var bytes = fs.statSync(OUTPUT).size;
    var csvBytes = fs.statSync(INPUT).size;
    console.log("Wrote " + OUTPUT);
    console.log("  nodes: " + nodeCount);
    console.log("  size:  " + (bytes / 1024 / 1024).toFixed(2) + " MB (was " + (csvBytes / 1024 / 1024).toFixed(2) + " MB CSV)");
  }

  if (!shouldFetchCommonNames) {
    writeOutput();
    return;
  }

  console.log(
    "Common name fetch threshold: >= " + MIN_OCCURRENCES_FOR_COMMON_NAMES +
    " occurrences (" + result.idsForCommonNames.length + " taxa)"
  );

  fetchCommonNames(result.idsForCommonNames, result.commonNamesCache).then(function () {
    result = buildTree({ fetchCommonNames: false });
    tree = result.tree;
    writeOutput();
  }).catch(function (err) {
    console.error("Failed to fetch common names:", err.message);
    process.exit(1);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  buildTree: buildTree
};
