/**
 * Local taxon hierarchy: parent/child links by name.
 * Tree format: { "<taxon_name>": [<parent_name|null>, [<child_name>, ...]], ... }
 */
var taxaTree = (function () {
  var tree = null;
  var loading = null;

  function load() {
    if (tree) {
      return Promise.resolve(tree);
    }
    if (loading) {
      return loading;
    }

    loading = new Promise(function (resolve, reject) {
      d3.json("taxa/taxon_tree.json", function (err, data) {
        if (err) {
          loading = null;
          return reject(err);
        }
        tree = data;
        resolve(tree);
      });
    });

    return loading;
  }

  function resolveName(name) {
    if (!tree || !name) {
      return null;
    }
    if (tree[name]) {
      return name;
    }
    return null;
  }

  function getParent(name) {
    if (!tree) {
      return null;
    }
    if (!resolveName(name)) {
      return null;
    }
    return tree[name][0] || null;
  }

  function getChildren(name) {
    if (!tree) {
      return [];
    }
    if (!resolveName(name)) {
      return [];
    }
    return tree[name][1] || [];
  }

  function getAncestors(name) {
    if (!tree) {
      return [];
    }
    if (!resolveName(name)) {
      return [];
    }

    var ancestors = [];
    var seen = {};
    var parent = getParent(name);

    while (parent && !seen[parent]) {
      seen[parent] = true;
      ancestors.push(parent);
      parent = getParent(parent);
    }

    return ancestors;
  }

  function logHierarchy(name) {
    return load().then(function () {
      if (!resolveName(name)) {
        console.log("Taxon not found in local tree:", name);
        return;
      }

      var children = getChildren(name);
      var ancestors = getAncestors(name);

      console.log("Taxon filter — " + name);
      console.log("Children (" + children.length + "):", children);
      console.log("Ancestors (" + ancestors.length + "):", ancestors);
    }).catch(function (err) {
      console.warn("Could not load taxon tree:", err);
    });
  }

  function init() {
    return load().catch(function (err) {
      console.warn("Taxon tree preload failed:", err);
    });
  }

  return {
    init: init,
    load: load,
    getParent: getParent,
    getChildren: getChildren,
    getAncestors: getAncestors,
    logHierarchy: logHierarchy
  };
})();
