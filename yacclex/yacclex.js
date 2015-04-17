(function ($) {

var mainparser;

function bnfSyntaxError(e) {
  if (arguments.length < 1) {
    return;
  }
  alert(e);
}

function grammarConflicts(e) {
  if (arguments.length < 1) {
    return;
  }
  alert(e);
}

function execError(e) {
  if (arguments.length < 1) {
    return;
  }
  alert(e);
}

function generate() {
  bnfSyntaxError();
  grammarConflicts();
  var txt = $("#grammar").val();
  var cfg;
  try {
    cfg = bnf.parse(txt);
  } catch (e) {
    bnfSyntaxError(e);
    return;
  }
  var gen = Jison.Generator(cfg, { type: "lalr" });
  if (gen.conflicts) {
    grammarConflicts(gen.conflicts);
  }
  var js = gen.generate();
  eval(js);
  mainparser = parser;
}

function parse() {
  execError();
  generate();
  var txt = $("#input").val();
  var res;
  try {
    res = mainparser.parse(txt);
  } catch (e) {
    execError(e);
  }
  $("#output").text(res);
}

$(document).ready(function () {
    $("#generate").click(generate);
    $("#parse").click(parse);
});

})(jQuery);
