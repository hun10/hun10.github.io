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


function showHints(colorsArray) {
  var container = $("<div>", { style: "margin: 1.5em;"});
  for (var i = 0; i < colorsArray.length; i++) {
    var style = "background-color: " + colorsArray[i];
    style += "; padding: 1em; display: inline; border: 1px solid; margin: 0.5em"
    var el = $("<div>", { text: i, style: style });
    container.append(el);
  }
  return container;
}

function main() {
  var cells = makeRandomTable(3, 2);
  var colors = ["lightblue", "white"];
  var container = $("<center>");
  var table = showTable(cells, colors);
  container.append(table);
  var input = $("<input>");
  container.append(input);
  container.append($("<p>", { text: "Use these numbers to enumerate the colors in order:" }));
  var hints = showHints(colors);
  container.append(hints);
  $("body").append(container);
  input.focus();
  function wrongAnswer() {
    alert("Wrong!");
  }
  function rightAnswer() {
    alert("Ok.");
  }
  function checkAnswer() {
    var answer = input.val();
    if (answer.length == cells.length * cells.length) {
      for (var k = 0; k < answer.length; k++) {
        var c = Number(answer[k]);
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

$(main);
