(function ($) {

var mainparser;

function bnfSyntaxError(e) {
  if (arguments.length < 1) {
    $("#generatorFeedback").text("");
    $("#generatorFeedback").removeClass("error").removeClass("warning").removeClass("good");
    return;
  }
  $("#generatorFeedback").text(e);
  $("#generatorFeedback").addClass("error");
}

function grammarConflicts(e) {
  if (arguments.length < 1) {
    $("#generatorFeedback").text("");
    $("#generatorFeedback").removeClass("error").removeClass("warning").removeClass("good");
    return;
  }
  $("#generatorFeedback").text(e);
  $("#generatorFeedback").addClass("warning");
}

function execError(e) {
  if (arguments.length < 1) {
    $("#output").text("");
    $("#output").removeClass("error").removeClass("warning").removeClass("good");
    return;
  }
  $("#output").text(e);
  $("#output").addClass("error");
}

function generate() {
  bnfSyntaxError();
  grammarConflicts();
  execError();
  mainparser = undefined;
  var txt = $("#grammar").val();
  var cfg;
  try {
    cfg = bnf.parse(txt);
  } catch (e) {
    bnfSyntaxError(e);
    return;
  }
  try {
    var gen = Jison.Generator(cfg, { type: "lalr" });
    if (gen.conflicts) {
      grammarConflicts(gen.conflicts);
    }
    var js = gen.generate();
    eval(js);
    mainparser = parser;
    $("#generatorFeedback").text("Generated.");
    $("#generatorFeedback").addClass("good");
  } catch (e) {
    bnfSyntaxError(e);
    return;
  }
}

function parse() {
  generate();
  if (!mainparser) {
    execError("No generated parser.");
    return;
  }
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
