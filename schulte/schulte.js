function assert(expression) {
  if (!expression) {
    throw new Error("Assertion violated.");
  }
}

function shuffleArray(array) {
  for (var i = array.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
}

function makeRandomTable(size, colors) {
  assert(size > 0 && size % 2 != 0);
  assert(colors > 0);
  plain = [];
  for (var i = 0; i < size * size; i++) {
    plain.push(i + 1);
  }
  shuffleArray(plain);
  table = [];
  for (var i = 0, c = 0; i < size; i++) {
    table.push([]);
    for (var j = 0; j < size; j++) {
      table[i][j] = {
        num : plain[c],
        color : c % colors
      };
      c++;
    }
  }
  return table;
}

var isMobile;
var counterView;
var squareSize = 5;

function showTable(cells, colorsArray) {
  var table = $("<table>", { style: "border: 1px solid" });
  for (var i = 0; i < cells.length; i++) {
    var row = $("<tr>");
    for (var j = 0; j < cells[i].length; j++) {
      var style = "background-color: " + colorsArray[cells[i][j].color];
      style += "; width: 2em; height: 2em; vertical-align: middle; text-align: center"
      var cell = $("<td>", { text: cells[i][j].num, style: style });
      row.append(cell);
    }
    table.append(row);
  }
  return table;
}


function showHints(colorsArray, input, limit, checkAnswer) {
  function makeClick(i) {
    return function() {
      input.val(input.val() + i);
      if (counterView) {
        counterView.text(input.val().length);
      }
      if (input.val().length >= limit) {
        checkAnswer();
      }
    }
  }
  var container = $("<div id='hints'>", { style: "margin: 1.5em;"});
  if (!isMobile.matches) {
    container.append($("<p>", { text: "Use these numbers to enumerate the colors in order:" }));
  } else {
    container.append($("<p>", { style: "padding: 1em" }));
  }
  for (var i = 0; i < colorsArray.length; i++) {
    var style = "background-color: " + colorsArray[i];
    style += "; padding: 1em; display: inline; border: 1px solid; margin: 3em"
    var el = $("<div>", { style: style });
    if (!isMobile.matches) {
      el.text(i + 1);
    }
    el.click(makeClick(i + 1));
    container.append(el);
  }
  if (isMobile.matches) {
    counterView = $("<div>", { text: 0 });
    container.append(counterView);
  }
  return container;
}

function main() {
  isMobile = window.matchMedia("only screen and (max-width: 760px)");
  var cells = makeRandomTable(squareSize, 2);
  var colors = ["lightblue", "white"];
  var container = $("<center id='schulteTable'>");
  var table = showTable(cells, colors);
  container.append(table);
  var input = $("<input>");
  if (isMobile.matches) {
    input.hide();
  }
  container.append(input);
  var hints = showHints(colors, input, cells.length * cells.length, checkAnswer);
  var startTime = performance.now();
  container.append(hints);
  $("body").append(container);
  if (!isMobile.matches) {
    input.focus();
  }
  var again = $("<button>", { text: "Try Again" });
  again.click(function() { container.remove(); main(); });
  function wrongAnswer() {
    var result = $("<div>");
    result.append($("<p>", { text: "Wrong!" }));
    result.append(again);
    input.replaceWith(result);
    $("#hints").remove();
    again.focus();
  }
  function formatTime(time) {
    function fm(x) {
      if (x == 1) return x + " minute";
      return x + " minutes";
    }
    function fs(x) {
      if (x == 1) return x + " second";
      return x + " seconds";
    }
    time /= 100;
    time = Math.round(time);
    var seconds = time % 600;
    seconds /= 10;
    time = Math.floor(time / 600);
    var minutes = time;
    if (minutes > 0) {
      return fm(minutes) + " and " + fs(seconds);
    } else {
      return fs(seconds);
    }
  }
  function rightAnswer() {
    var endTime = performance.now();
    var time = endTime - startTime;
    var result = $("<div>");
    result.append($("<p>", { text: "Ok. You've spent " + formatTime(time) + "." }));
    result.append(again);
    input.replaceWith(result);
    $("#hints").remove();
    again.focus();
  }
  function checkAnswer() {
    var answer = input.val();
    if (answer.length == cells.length * cells.length) {
      for (var k = 0; k < answer.length; k++) {
        var c = Number(answer[k]) - 1;
        var found = false;
        for (var i = 0; i < cells.length; i++) {
          for (var j = 0; j < cells[i].length; j++) {
            if (cells[i][j].num == k + 1) {
              found = cells[i][j].color == c;
              break;
            }
          }
        }
        if (!found) {
          wrongAnswer();
          return;
        }
      }
      rightAnswer();
      return;
    }
    wrongAnswer();
  }
  input.keypress(function(e) { if (e.keyCode == 13) checkAnswer(); });
}

function init() {
  $(document).bind('touchmove', false);
  $("#t3").click(function() { $("#schulteTable").remove(); squareSize = 3; main(); });
  $("#t5").click(function() { $("#schulteTable").remove(); squareSize = 5; main(); });
  $("#t7").click(function() { $("#schulteTable").remove(); squareSize = 7; main(); });
  main();
}

$(init);
