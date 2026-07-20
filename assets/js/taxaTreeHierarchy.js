/**
 * Navigation-tree UI: clickable ancestor and child buttons for the local taxon tree.
 */
var taxaTreeHierarchy = (function () {
  function formatTaxonButtonLabel(taxonName, showOccurrences) {
    var label = taxonName;
    if (showOccurrences) {
      var occurrences = taxaTree.getTotalOccurrences(taxonName);
      label += " (" + (occurrences != null ? occurrences : "unknown") + ")";
    }
    var common = taxaTree.getCommonName(taxonName);
    if (common) {
      label += " — " + common;
    }
    return label;
  }

  function renderHierarchyButtons(containerId, taxonNames, showOccurrences) {
    var container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    container.innerHTML = "";

    if (taxonNames.length === 0) {
      container.innerHTML = '<span class="local-hierarchy-empty">None</span>';
      return;
    }

    taxonNames.forEach(function (taxonName) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-default btn-xs local-hierarchy-btn";
      button.setAttribute("data-taxon-name", taxonName);
      button.textContent = formatTaxonButtonLabel(taxonName, showOccurrences);
      container.appendChild(button);
    });
  }

  function attachHierarchyClickHandlers() {
    $("#localTaxonHierarchy .local-hierarchy-btn").off("click").on("click", function (event) {
      event.preventDefault();
      var taxonName = $(this).attr("data-taxon-name");
      if (taxonName && typeof navMap !== "undefined") {
        navMap.filterByTaxon(taxonName);
      }
    });
  }

  function showHierarchy(name) {
    var panel = document.getElementById("localTaxonHierarchy");
    if (!panel) {
      return;
    }

    var ancestors = taxaTree.getAncestors(name).slice().reverse();
    var children = taxaTree.getChildren(name);

    renderHierarchyButtons("localTaxonAncestors", ancestors, false);
    renderHierarchyButtons("localTaxonChildren", children, true);
    attachHierarchyClickHandlers();
    panel.style.display = "block";
  }

  function hideHierarchy() {
    var panel = document.getElementById("localTaxonHierarchy");
    if (panel) {
      panel.style.display = "none";
    }
  }

  return {
    showHierarchy: showHierarchy,
    hideHierarchy: hideHierarchy
  };
})();
