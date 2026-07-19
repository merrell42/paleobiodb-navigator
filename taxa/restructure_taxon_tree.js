/**
 * Occurrence-based taxon tree restructuring.
 *
 * Dominant children (>= splitThreshold share of sibling occurrences) are skipped;
 * their descendants are promoted to the parent's navigation children instead.
 * Skipped nodes get updated parent/children links for direct lookup.
 *
 * Tree node format: [parent, children, common_name, total_occurrences]
 */

var SPLIT_THRESHOLD = 0.5;

function getParent(entry) {
  return entry[0];
}

function getChildren(entry) {
  return entry[1];
}

function getCommonName(entry) {
  return entry[2];
}

function getOccurrences(entry) {
  return entry[3];
}

function setParent(entry, parent) {
  entry[0] = parent;
}

function setChildren(entry, children) {
  entry[1] = children;
}

// Find the new children of the anchor node. NodeA is a descendant of the anchor.
// If one children has most of the descendants of the anchor, we skip it and promote
// its descendants to the anchor. This allows to skip to the more interesting parts of the tree.
function findNewChildren(tree, nodeNameA, anchorName, chain) {
  var nodeA = tree[nodeNameA];
  var anchor = tree[anchorName];

  // Exit early if there is a cycle in the tree.
  if (chain.includes(nodeNameA)) {
    return [];
  }
  chain = chain.concat([nodeNameA]);

  var newChildren = [];
  getChildren(nodeA).forEach((childNameB) => {
    var childB = tree[childNameB];
    if (!childB) {
      return;
    }

    var occurrencesB = getOccurrences(childB);
    if (occurrencesB === 0) {
      return;
    }

    var fractionB = occurrencesB / getOccurrences(anchor);
    var isLeaf = getChildren(childB).length === 0;
    if (fractionB < SPLIT_THRESHOLD || isLeaf) {
      newChildren.push(childNameB);
    } else {
      var newChildrenB = findNewChildren(tree, childNameB, anchorName, chain);
      newChildren = newChildren.concat(newChildrenB);

      // ChildB is skipped. It's parent is the anchor and it shares its children with the anchor.
      // But it is not a child of the anchor or a parent to the anchor's children.
      setParent(childB, anchorName);
      setChildren(childB, newChildrenB.slice());
    }
  });

  // Sort by occurrences.
  return newChildren.slice().sort(function (a, b) {
    return getOccurrences(tree[b]) - getOccurrences(tree[a]);
  });
}

function restructureTree(tree, rootName) {
  rootName = rootName || "Life";

  function processNode(nodeName) {
    var newChildren = findNewChildren(tree, nodeName, nodeName, []);
    setChildren(tree[nodeName], newChildren);
    newChildren.forEach((childName) => {
      setParent(tree[childName], nodeName);
    });
    newChildren.forEach(processNode);
  }

  processNode(rootName);
  return tree;
}

module.exports = {
  findNewChildren: findNewChildren,
  restructureTree: restructureTree
};
