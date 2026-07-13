var diversityPlot = (function() {
  var margin = {top: 16, right: 56, bottom: 68, left: 78},
      padding = {top: 0, right: 0, bottom: 0, left: 0},
      width = 720,
      height = 420,
      plotHeight = height - margin.top - margin.bottom,
      plotWidth = width - margin.left - margin.right,
      currentRequest;

  // Fetch diversity data from PBDB
  function getDiversityData(url,full) {
    // Abort any pending requests
    if(typeof(diversityPlot.currentRequest) != 'undefined') {
      if (Object.keys(diversityPlot.currentRequest).length > 0) {
        diversityPlot.currentRequest.abort();
        diversityPlot.currentRequest = {};
      }
    }
    // if(url.match('authent_by')){
    //   url = url.replace('/quickdiv.json','/diversity.json');
    // }
    
    // Show the spinner and remove the existing plot
    $("#diversityWait").css("display", "block");
    d3.select("#diversity").select("svg").remove();
    
    diversityPlot.currentRequest = d3.json(url, function(error, data) {
      if (error) {
        alert("Error retrieving diversity data");
        console.log(error);
      } else {
        getTimescale(data.records.map(function(d) {
          d.total = d.dsb;
          return d;
        }),full);
      }
    });
  }

  // Pad the data age range slightly so points are not flush to the plot edges
  function ageDomain(data) {
    var maxAge = d3.max(data, function(d) { return d.eag; }),
        minAge = d3.min(data, function(d) { return d.lag; }),
        span = Math.max(maxAge - minAge, 1),
        pad = Math.max(span * 0.03, 0.5);
    return {
      max: maxAge + pad,
      min: Math.max(0, minAge - pad)
    };
  }

  // Get appropriate timescale
  function getTimescale(data,full) {
    // Fit the requested intervals to the data, not whole eras
    var domain = ageDomain(data),
        requestedMaxAge = domain.max,
        requestedMinAge = domain.min;
    
    // Request timescale data
    $.ajax(paleo_nav.dataUrl + paleo_nav.dataService + "/intervals/list.json?scale=1&order=age.desc&max_ma=" + requestedMaxAge + "&min_ma=" + requestedMinAge )
      .fail(function(error) {
        console.log(error);
      })
      .done(function(timeData) {
        // Filter for eras and periods
        var timescale = timeData.records.filter(function(d) {
          if ( d.itp == 'era' || d.itp == 'period' ) {
            d.totalTime = d.eag - d.lag;
            return d;
          }
        });
        // Draw the chart
        draw(data, timescale, full);
      });
  } // End getTimescale

  function draw(data, timescale, full) {
    var divname=(full)?"#advdiversity":"#diversity";
    // Remove any old ones...
    d3.select("#diversity","#advdiversity").select("svg").remove();

    var domain = ageDomain(data);

    // Filter out the periods and eras for drawing purposes
    var periods = timescale.filter(function(d) {
      if ( d.itp == 'period' && d.eag > domain.min && d.lag < domain.max ) {
        return d;
      }
    });

    var eras = timescale.filter(function(d) {
      if ( d.itp == 'era' && d.eag > domain.min && d.lag < domain.max ) {
        return d;
      }
    });

    // Calculate origination, extinction, and rangethrough diversity
    if (full) {
      data.map(function(d) {
        if (d.eag > 0.5) {
          d.origination = -Math.log((d.xbt)/(d.xbt+d.xft))/(d.eag-d.lag);
        } else {
          d.origination = NaN;
        };
      });
      data.map(function(d) {
        if (d.eag > 0.5) {
          d.extinction = -Math.log((d.xbt)/(d.xbt+d.xbl))/(d.eag-d.lag);
        } else {
          d.origination = NaN;
        };
      });
      data.map(function(d) {
        d.rangethroughYes = d.xft+d.xbl+d.xfl+d.xbt;
        d.rangethroughNo = d.xbl+d.xfl+d.xbt;
      });
      var sampled = $('[name="extant"]').is(":checked");
      var rangethrough = $('[name="extant"]').is(":checked");
      var origination = $('[name="extant"]').is(":checked");
      var extinction = $('[name="extant"]').is(":checked");
    };

    // Define a scale for the x axis — fit to the data range
    var x = d3.scale.linear()
      .domain([domain.max, domain.min])
      .range([0, plotWidth]);

    // Define a scale for the y axis
    if(full) {
      var y = d3.scale.linear()
        .domain([0, d3.max(data, function(d) { return d.rangethroughYes; }) * 1.05])
        .range([plotHeight, 0]);
      var y2 = d3.scale.linear()  
        .domain([-1,1])
        .range([plotHeight, 0]);
    } else {
      var y = d3.scale.linear()
        .domain([0, d3.max(data, function(d) { return d.total; }) * 1.05])
        .range([plotHeight, 0]);
    }

    // Create an x axis
    var xAxis = d3.svg.axis()
      .scale(x)
      .orient("bottom")
      .tickSize(0)
      .ticks(6);

    // Create a Y axis
    var yAxis = d3.svg.axis()
      .scale(y)
      .orient("left")
      .ticks(5);

    if (full) {
      var yAxis2 = d3.svg.axis()
        .scale(y2)
        .orient("right")
        .tickValues([-1,0,1])
        .tickFormat(Math.abs);      
    }

    // Position intervals on the same domain as the data
    var periodPos = d3.scale.linear()
      .domain([domain.max, domain.min])
      .range([0, plotWidth]);

    function intervalX(d) {
      return periodPos(Math.min(d.eag, domain.max));
    }

    function intervalWidth(d) {
      var left = Math.min(d.eag, domain.max),
          right = Math.max(d.lag, domain.min);
      return Math.max(0, periodPos(right) - periodPos(left));
    }

    // Draw the SVG to hold everything
    var svg = d3.select(divname).append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("id", full?"advdiversityGraph":"diversityGraph")
      .append("g")
      .attr("id", full?"advdiversityGraphGroup":"diversityGraphGroup")
      .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
      .style("font-family", "Helvetica,sans-serif")
      .style("fill", "#333")
      .style("font-weight","100")
      .style("font-size","11px");

    // Draw a group to hold the timescale
    var scale = d3.select(divname + "Graph").select("g")
      .append("g")
      .attr("id", "timeScale")
      .attr("transform", "translate(" + padding.left + "," + (plotHeight + 2) + ")");

    // Draw the periods
    scale.selectAll(".periods")
      .data(periods)
      .enter().append("rect")
      .attr("height", "16")
      .attr("width", intervalWidth)
      .attr("x", intervalX)
      .attr("id", function(d) { return "r" + d.oid.replace("int:","") })
      .style("fill", function(d) { return d.col })
      .style("opacity", 0.83)
      .append("svg:title")
      .text(function(d) { return d.nam });

    // Draw period abbreviations
    scale.selectAll(".periodNames")
      .data(periods)
      .enter().append("text")
      .attr("x", function(d) { return intervalX(d) + intervalWidth(d) / 2 })
      .attr("y", "11")
      .attr("id", function(d) { return "l" + d.oid.replace("int:","") })
      .attr("class", "timeLabel abbreviation")
      .style("font-size","9px")
      .text(function(d) { return d.abr });

    // Draw the full period names
    scale.selectAll(".periodNames")
      .data(periods)
      .enter().append("text")
      .attr("x", function(d) { return intervalX(d) + intervalWidth(d) / 2 })
      .attr("y", "11")
      .attr("class", "timeLabel dFullName")
      .style("font-size","9px")
      .attr("id", function(d) { return "l" + d.oid.replace("int:","") })
      .text(function(d) { return d.nam });

    // Draw the era(s)
    scale.selectAll(".eras")
      .data(eras)
      .enter().append("rect")
      .attr("height", "16")
      .attr("width", intervalWidth)
      .attr("x", intervalX)
      .attr("y", "16")
      .attr("id", function(d) { return "r" + d.oid.replace("int:","") })
      .style("fill", function(d) { return d.col })
      .style("opacity", 0.83)
      .append("svg:title")
      .text(function(d) { return d.nam });

    // Draw the full era names
    scale.selectAll(".eraNames")
      .data(eras)
      .enter().append("text")
      .attr("x", function(d) { return intervalX(d) + intervalWidth(d) / 2 })
      .attr("y", "27")
      .attr("class", "timeLabel dFullName")
      .style("font-size","9px")
      .attr("id", function(d) { return "l" + d.oid.replace("int:","") })
      .text(function(d) { return d.nam; });

    // Append the x axis along the bottom of the plot (matches y-axis styling)
    var xAxisGroup = svg.append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(" + padding.left + "," + plotHeight + ")")
      .style("font-size","11px")
      .call(xAxis);

    xAxisGroup.select("path.domain")
      .style("fill", "none")
      .style("stroke", "#777")
      .style("stroke-width", "1px")
      .style("display", "block");

    xAxisGroup.selectAll("line")
      .style("stroke", "#777");

    // Keep age labels below the timescale strip
    xAxisGroup.selectAll("text")
      .attr("y", 48)
      .style("fill", "#777");

    // Append the y axis
    var label = svg.append("g")
      .attr("class", "y axis")
      .attr("transform", "translate(" + padding.left + ",0)")
      .style("font-size","11px")
      .style("letter-spacing","normal")
      .call(yAxis);

    // Keep a visible vertical axis line
    label.select("path.domain")
      .style("fill", "none")
      .style("stroke", "#777")
      .style("stroke-width", "1px")
      .style("display", "block");

    label.selectAll("line")
      .style("stroke", "#777");

    // Axis title sits left of the tick numbers (after rotate, y is horizontal offset)
    label.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -62)
      .attr("x", -plotHeight / 2)
      .attr("dy", "0")
      .style("fill","#777")
      .style("text-anchor", "middle")
      .style("font-size", "12px")
      .style("font-weight", 400)
      .text($("[name=taxonLevel]").val() + " sampled in " + $("[name=timeLevel]").val());

    label.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -48)
      .attr("x", -plotHeight / 2)
      .style("text-anchor", "middle")
      .style("font-size", "10px")
      .style("font-weight", 300)
      .style("font-style", "italic")
      .style("fill","#777")
      .text("(approximate)");

    label.selectAll(".tick text")
      .style("letter-spacing","normal")
      .style("fill","#777");

    if(full){ //append the second y-axis
      var label2 = svg.append("g")
        .attr("class", "y axis")
        .attr("transform", "translate(" + plotWidth + ",0)")
        .style("font-size","11px")
        .style("letter-spacing","normal")
        .call(yAxis2);

      label2.select("path.domain")
        .style("fill", "none")
        .style("stroke", "#777")
        .style("stroke-width", "1px");

      label2.selectAll("line")
        .style("stroke", "#777");

      label2.append("text")
        .attr("transform", "rotate(90)")
        .attr("y", -36)
        .attr("x", plotHeight * 0.28)
        .attr("dy", "1em")
        .style("fill","green")
        .style("text-anchor", "middle")
        .style("font-size", "11px")
        .style("font-weight", 400)
        .text("origination");

      label2.append("text")
        .attr("transform", "rotate(90)")
        .attr("y", -36)
        .attr("x", plotHeight * 0.72)
        .attr("dy", "1em")
        .style("fill","red")
        .style("text-anchor", "middle")
        .style("font-size", "11px")
        .style("font-weight", 400)
        .text("extinction");

      label2.append("text")
        .attr("transform", "rotate(90)")
        .attr("y", -52)
        .attr("x", plotHeight / 2)
        .attr("dy", "1em")
        .style("fill","#777")
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .style("font-weight", 400)
        .text("rates per " + $("[name=taxonLevel]").val() + " per Myr");

      label2.selectAll(".tick text")
        .style("letter-spacing","normal")
        .style("fill","#777");
    }

    // Draw zee line
    var line = d3.svg.line()
      .interpolate("linear")
      .x(function(d) { return periodPos(d.eag) })
      .y(function(d) { return y(d.total); });

      svg.append("path")
        .datum(data)
        .attr("class", "line diversityLine sampledLine")
        .attr("style", "fill: none; stroke: #555; stroke-width: 1.5px;")
        .attr("d", line)
        .attr("transform", "translate(" + padding.left + ",0)");

    if(full){
      toggleLine('sampledLine');

      var lineRangethroughYes = d3.svg.line()
        .interpolate("linear")
        .x(function(d) { return periodPos(d.eag); })
        .y(function(d) { return y(d.rangethroughYes); });
      
        svg.append("path")
          .attr("class", "line diversityLine rangethroughLineYes")
          .attr("style", "fill: none; stroke: black; stroke-width: 1.5px; stroke-dasharray: 4,2; display:none;")
          .attr("d", lineRangethroughYes(data))
          .attr("transform", "translate(" + padding.left + ",0)");

      var lineRangethroughNo = d3.svg.line()
        .interpolate("linear")
        .x(function(d) { return periodPos(d.eag); })
        .y(function(d) { return y(d.rangethroughNo); });
      
        svg.append("path")
          .attr("class", "line diversityLine rangethroughLineNo")
          .attr("style", "fill: none; stroke: black; stroke-width: 1.5px; stroke-dasharray: 4,2; display:none;")
          .attr("d", lineRangethroughNo(data))
          .attr("transform", "translate(" + padding.left + ",0)");

        toggleLine('rangethroughLine');

      var lineOrigination = d3.svg.line()
        .interpolate("linear")
        .defined(function(d) { return !isNaN(d.origination)&isFinite(d.origination); })
        .x(function(d) { return periodPos(d.eag); })
        .y(function(d) { return y2(d.origination); });

        svg.append("path")
          .datum(data)
          .attr("class", "line diversityLine originationLine")
          .attr("style", "fill: none; stroke: green; stroke-width: 1.5px; display:none;")
          .attr("d", lineOrigination(data))
          .attr("transform", "translate(" + padding.left + ",0)");

        toggleLine('originationLine');


      var lineExtinction = d3.svg.line()
        .interpolate("linear")
        .defined(function(d) { return !isNaN(d.extinction)&isFinite(d.extinction); })
        .x(function(d) { return periodPos(d.eag) })
        .y(function(d) { return y2(-d.extinction); });

        svg.append("path")
          .datum(data)
          .attr("class", "line diversityLine extinctionLine")
          .attr("style", "fill: none; stroke: red; stroke-width: 1.5px; display:none;")
          .attr("d", lineExtinction(data))
          .attr("transform", "translate(" + padding.left + ",0)");

          toggleLine('extinctionLine');
    }

    positionLabels(false,full);

    $("#diversityWait").css("display", "none");
    $("#advdiversityWait").css("display", "none");
    
  }

  function positionLabels(stop,full) {
    var modalName = full?"advdiversityGraphGroup":"diversityGraphGroup";

    var labels = d3.selectAll(".dFullName");

    // Show all the labels so we can properly compute widths
    d3.selectAll(".dFullName").style("display","block");
    d3.selectAll(".abbreviation").style("display","block");

    for (var i = 0; i < labels[0].length; i++) {
      var id = d3.select(labels[0][i]).data()[0].oid.replace("int:",""),
          rectWidth = parseFloat(d3.select("rect#r" + id).attr("width")),
          rectX = parseFloat(d3.select("rect#r" + id).attr("x"))

      var labelWidth;
      try {
        labelWidth = d3.select(".dFullName#l" + id).node().getComputedTextLength();
      } catch(err) {
        labelWidth = 25;
      }

      // If the full label doesn't fit...
      if (rectWidth - 8 < labelWidth) {
        // Hide the full label
        d3.select(".dFullName#l" + id).style("display", "none");

        // Then check if the abbreviated label will fit
        var abbreviationWidth;
        try {
          abbreviationWidth = d3.select(".abbreviation#l" + id).node().getComputedTextLength();
        } catch(err) {
          abbreviationWidth = 10;
        }

        if (rectWidth - 8 < abbreviationWidth) {
          d3.select(".abbreviation#l" + id).style("display", "none");
        } else {
          d3.select(".abbreviation#l" + id)
            .style("display", "block")
            .attr("x", rectX + ((rectWidth - abbreviationWidth)/ 2));
        }

      } else {
        // Otherwise, hide the abbreviation and position the full label
        d3.select(".abbreviation#l" + id).style("display", "none");
        d3.select(".dFullName#l" + id).attr("x", rectX + ((rectWidth - labelWidth)/ 2));
      }
    }

    if (!stop) {
      setTimeout(function(){resize(full)}, 100);
    }

  }

  function resize(full) {
    var modalPrefix = full?"adv":"";

    $("." + modalPrefix + "statsContent").height("auto");
    var containerHeight = $("." + modalPrefix + "diversityContainer").height() - 50,
        containerWidth = $("." + modalPrefix + "diversityContainer").width() - 50;

    if (containerHeight > containerWidth) {
      var scale = containerWidth / width;

      if ((scale * height) > containerHeight) {
        scale = containerHeight / height;
      }
    } else {
      // width > height
      var scale = containerHeight / height;

      if ((scale * width) > containerWidth) {
        scale = containerWidth / width;
      }
    }

    d3.select("#" + modalPrefix + "diversityGraphGroup")
      .attr("transform", "scale(" + scale + ")translate(" + margin.left + "," + margin.top + ")");

    var computedWidth = d3.select("#" + modalPrefix + "diversityGraphGroup").node().getBBox().width;
    d3.select("#" + modalPrefix + "diversityGraph")
      .attr("height", Math.max(containerHeight, height * scale) + 8)
      .attr("width", Math.max(computedWidth * scale + margin.left * scale, width * scale));

    positionLabels(true);
  }

  d3.select(window).on("resize", positionLabels);


  function toggleLine(lineName){
    var checked = $('[name=' + lineName + ']').is(":checked");
    if (lineName === "rangethroughLine") {
      var singletons = $('[name="singletons"]').is(":checked");
      var lineNameFull = singletons?['rangethroughLineYes','rangethroughLineNo']:['rangethroughLineNo','rangethroughLineYes'];
      $('.' + lineNameFull[0]).css("display" , checked ? '' : 'none');
      $('.' + lineNameFull[1]).css("display" , 'none');
    } else {
      $('.' + lineName).css("display" , checked ? '' : 'none');
    }
  }

  function updateQuickdiv() {
    var taxonLevel = $("[name=taxonLevel]").val();
    var timeLevel = $("[name=timeLevel]").val();
    var url=paleo_nav.dataUrl;

    $("#advtaxonLevel").html(taxonLevel);
    $("#advtimeLevel").html(timeLevel);

    var bounds = map.getBounds(),
      sw = bounds._southWest,
      ne = bounds._northEast;
    if (parseInt(d3.select("#map").style("height")) < 1) {
      sw.lng = -180,
      ne.lng = 180,
      sw.lat = -90,
      ne.lat = 90;
    }

    url += paleo_nav.dataService + "/occs/quickdiv.json?";
    url = navMap.parseURL(url);
    url += "&lngmin=" + sw.lng.toFixed(1) + "&lngmax=" + ne.lng.toFixed(1) + "&latmin=" + sw.lat.toFixed(1)  + "&latmax=" + ne.lat.toFixed(1);
    url += "&count="+taxonLevel+"&time_reso="+timeLevel;
    getDiversityData(url);
  }

  // function updateFulldiv() {
  //   var taxonLevel = $("[name=taxonLevel]").val();
  //   var timeLevel = $("[name=timeLevel]").val();
  //   var extant = $('[name="extant"]').is(":checked");
  //   var url=paleo_nav.dataUrl;

  //   var bounds = map.getBounds(),
  //     sw = bounds._southWest,
  //     ne = bounds._northEast;
  //   if (parseInt(d3.select("#map").style("height")) < 1) {
  //     sw.lng = -180,
  //     ne.lng = 180,
  //     sw.lat = -90,
  //     ne.lat = 90;
  //   }

  //   url +=  paleo_nav.dataService + "/occs/diversity.json?";
  //   url = navMap.parseURL(url);
  //   url += "&lngmin=" + sw.lng.toFixed(1) + "&lngmax=" + ne.lng.toFixed(1) + "&latmin=" + sw.lat.toFixed(1)  + "&latmax=" + ne.lat.toFixed(1);
  //   url += "&count=" + taxonLevel + "&time_reso=" + timeLevel + "&recent=" + extant;
  //   getDiversityData(url);
  // }

  function saveImg(full) {
    var html = d3.select(full?"#advdiversityGraph":"#diversityGraph")
          .attr("version", 1.1)
          .attr("xmlns", "http://www.w3.org/2000/svg")
          .node().parentNode.innerHTML;

    var imgsrc = 'data:image/svg+xml;base64,'+ btoa(html);
    var img = '<img src="'+imgsrc+'">'; 
    d3.select(full?"#advsvgdataurl":"#svgdataurl").html(img);

    getCanvasSize(full);

    var canvas = document.querySelector("canvas"),
      context = canvas.getContext("2d");

    var image = new Image;
    image.src = imgsrc;
    image.onload = function() {
      context.drawImage(image, 0, 0);

      var canvasdata = canvas.toDataURL("image/png");

      var pngimg = '<img src="'+canvasdata+'">'; 
      d3.select((full)?"#advpngdataurl":"#pngdataurl").html(pngimg);

      var a = document.createElement("a");
      a.download = "diversity-curve.png";
      a.href = canvasdata;
      a.id = "downloadLink";
      document.getElementsByTagName("body")[0].appendChild(a);
      a.click();
    }
  };

  function getCanvasSize(full) {
    var svg = d3.select(full?"#advdiversityGraph":"#diversityGraph");
    var height = svg.attr("height");
    var width = svg.attr("width");
    d3.select("canvas").attr("height",height).attr("width",width);
  } 

  return {
    "plot": getDiversityData,
    "resize": resize,
    "currentRequest": currentRequest,
    "updateQuickdiv": updateQuickdiv,
    // "updateFulldiv": updateFulldiv,
    "saveImg": saveImg,
    "getCanvasSize": getCanvasSize,
    "toggleLine": toggleLine
  }

})();
