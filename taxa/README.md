# Taxonomy data

The app loads `taxon_tree.json` at runtime. That file is built locally from a PBDB taxonomy export.

## Files

| File | In git? | Purpose |
|---|---|---|
| `pbdb_data.csv` | No | Raw PBDB taxonomy download (~80 MB) |
| `common_names.json` | No | Cached common names from PBDB API (optional) |
| `taxon_tree.json` | Yes | Compressed tree used by the app |
| `build_taxon_tree.js` | Yes | Build script |
| `restructure_taxon_tree.js` | Yes | Occurrence-based navigation restructuring |

## Recreate `pbdb_data.csv`

Download the full PBDB taxonomy as CSV from the [PBDB Data Service](https://paleobiodb.org/data1.2/taxa/list_doc.html):

```bash
curl -o taxa/pbdb_data.csv "https://paleobiodb.org/data1.2/taxa/list.csv?all_taxa&show=full&limit=all"
```

On Windows PowerShell:

```powershell
curl.exe -o taxa/pbdb_data.csv "https://paleobiodb.org/data1.2/taxa/list.csv?all_taxa&show=full&limit=all"
```

This uses `all_taxa` (entire taxonomy) and `show=full` (includes `parent_name`, `common_name`, `n_occs`, and related fields). The download is large and may take several minutes.

You can also use the [PBDB download generator](https://paleobiodb.org/#/download) in the web interface: choose **Taxonomic names**, select **all taxa**, CSV format, and include full field set if offered.

### Required CSV columns

`build_taxon_tree.js` reads these column names from the header row:

- `taxon_no`, `taxon_name`, `difference`, `accepted_no`, `accepted_name`, `parent_no`, `n_occs`
- Optional: `parent_name`, `common_name`

## Build `taxon_tree.json`

From the repository root:

```bash
npm run build:taxa
```

The build reads `pbdb_data.csv`, writes a parent/child tree, and repairs missing child links. Restructuring is **off by default**. To compress navigation (skip dominant children, promote descendants):

```bash
npm run build:taxa:restructure
```

Or set `RESTRUCTURE_TREE = true` in `build_taxon_tree.js`, or pass `--restructure`.

To also fetch English common names from the PBDB API for taxa with at least 100 occurrences (writes `common_names.json`, then rebuilds):

```bash
npm run build:taxa:common-names
```

The app only needs `taxon_tree.json`; you do not need `pbdb_data.csv` to run Navigator unless you are rebuilding the tree.
