function show(obj) {
  var container = $("<div>", { style: "border: 1px black solid; margin: 1em; padding: 0.5em" })
  if ($.isArray(obj)) {
    for (var i in obj) {
      container.append(show(obj[i]));
    }
  } else if ($.isNumeric(obj) || $.type(obj) === "string") {
    return obj + " ";
  } else {
    for (var i in obj) {
      var line;
      if (i == "computedBy") {
        var didItAlready = false;
        var onclick = function() {
          if (didItAlready) return false;
          didItAlready = true;
          container.append(show(obj.computedBy));
          return false;
        };
        line = $("<a>", { text: i, href: "#", click: onclick });
      } else {
        line = $("<p>", { text: i + ": " });
        line.append(show(obj[i]));
      }
      container.append(line);
    }
  }
  return container;
}

var _ = function() {
  var rules = [];
  var fn = function(rule, args) {
    var name = rule;
    if (rules[name] == undefined) {
      throw new Error("No such rule: " + rule);
    }
    rule = rules[name];
    rule.checker.apply(null, args);
    var result = rule.result.apply(null, args);
    result.computedBy = {
      rule : name,
      args : args
    };
    return result;
  };
  fn.rule = function(name, argsChecker, resultFn) {
    if (rules[name]) {
      throw new Error("Rule already defined.");
    }
    rules[name] = {
      checker : argsChecker,
      result : resultFn
    };
  };
  return fn;
}();

function isString(obj) {
  if ($.type(obj) !== "string") {
    throw new Error(obj + " is not a string.");
  }
}

function isInteger(obj) {
  if (!$.isNumeric(obj)) {
    throw new Error(obj + " is not a number.");
  }
  if (Math.floor(obj) != +obj) {
    throw new Error(obj + " is not an integer.");
  }
}

function isIndexOfString(i, s, forEmpty) {
  isInteger(i);
  if (forEmpty == undefined) {
    forEmpty = false;
  }
  if (i < 1 || i > (forEmpty ? s.length + 1 : s.length)) {
    throw new Error(i + " is out of \"" + s + "\" bounds.");
  }
}

var tmp = function() {
  function checker(S, i, j) {
    isString(S);
    isIndexOfString(i, S);
    isIndexOfString(j, S);
  };
  function result(S, i, j) {
    return {
      kind : S[i - 1] == S[j - 1] ? "EQ" : "NE",
      S : S,
      i : i,
      j : j
    };
  }
  _.rule("Compare chars", checker, result);
}();

function isCharsCmp(obj) {
  if (obj.kind != "EQ" && obj.kind != "NE") {
    throw new Error(obj + " is not a char comparison result.");
  }
}

function isSubstrCmp(obj) {
  if (obj.kind != "SEQ" && obj.kind != "SNE") {
    throw new Error(obj + " is not a substring comparison result.");
  }
}

var tmp = function() {
  function checker(charsCmp, substrCmp) {
    isCharsCmp(charsCmp);
    isSubstrCmp(substrCmp);
    if (charsCmp.S != substrCmp.S) {
      throw new Error("Comparisons refer to different strings.");
    }
    if (substrCmp.i + substrCmp.k != charsCmp.i || substrCmp.j + substrCmp.k != charsCmp.j) {
      throw new Error("Chars do not extend substrings to right.");
    }
  };
  function result(charsCmp, substrCmp) {
    return {
      kind : (charsCmp.kind == "EQ" && substrCmp.kind) == "SEQ" ? "SEQ" : "SNE",
      S : substrCmp.S,
      i : substrCmp.i,
      j : substrCmp.j,
      k : substrCmp.k + 1
    };
  }
  _.rule("Extend substrings", checker, result);
}();

var tmp = function() {
  function checker(S, i, j) {
    isString(S);
    isIndexOfString(i, S, true);
    isIndexOfString(j, S, true);
  };
  function result(S, i, j) {
    return {
      kind : "SEQ",
      S : S,
      i : i,
      j : j,
      k : 0
    };
  }
  _.rule("Empty equal substrings", checker, result);
}();

var tmp = function() {
  function checker(substrCmp) {
    isSubstrCmp(substrCmp);
    if (substrCmp.kind != "SEQ") {
      throw new Error("Border needs equal substrings.");
    }
    if (substrCmp.i != 1) {
      throw new Error("Left substring is not a prefix");
    }
  };
  function result(substrCmp) {
    return {
      kind : "BRD",
      S : substrCmp.S,
      pfx : substrCmp.j + substrCmp.k - 1,
      len : substrCmp.k
    };
  }
  _.rule("Make border", checker, result);
}();

function isBorder(obj) {
  if (obj.kind != "BRD") {
    throw new Error(obj + " is not a border.");
  }
}

var tmp = function() {
  function checker(eqSubstr, subsubstr) {
    isSubstrCmp(eqSubstr);
    if (eqSubstr.kind != "SEQ") {
      throw new Error("Super-substrings equality is required.");
    }
    isSubstrCmp(subsubstr);
    if (eqSubstr.S != subsubstr.S) {
      throw new Error("Substrings refer to different strings.");
    }
    if (Math.min(subsubstr.i, subsubstr.j) < eqSubstr.i ||
        Math.max(subsubstr.i + subsubstr.k, subsubstr.j + subsubstr.k) > eqSubstr.i + eqSubstr.k) {
      throw new Error("Sub-substrings are out of left super-substring.");
    }
  };
  function result(eqSubstr, subsubstr) {
    return {
      kind : subsubstr.kind,
      S : eqSubstr.S,
      i : subsubstr.i,
      j : subsubstr.j + eqSubstr.j - eqSubstr.i,
      k : subsubstr.k
    };
  }
  _.rule("Translate subsubstring", checker, result);
}();

var tmp = function() {
  function checker(border) {
    isBorder(border);
  };
  function result(border) {
    return {
      kind : "SEQ",
      S : border.S,
      i : 1,
      j : border.pfx - border.len + 1,
      k : border.len
    };
  }
  _.rule("Equal substrings from border", checker, result);
}();

var tmp = function() {
  function checker(S, pfx) {
    isString(S);
    isIndexOfString(pfx, S);
  };
  function result(S, pfx) {
    return {
      kind : "QSNE",
      S : S,
      pfx : pfx,
      range : [pfx, pfx - 1]
    };
  }
  _.rule("Vacuous quantified unequal borders", checker, result);
}();

function isQuantifiedUnequalBorders(obj) {
  if (obj.kind != "QSNE") {
    throw new Error(obj + " is not a quantified unequal borders.");
  }
}

var tmp = function() {
  function checker(qub, nesubstr) {
    isQuantifiedUnequalBorders(qub);
    isSubstrCmp(nesubstr);
    if (qub.S != nesubstr.S) {
      throw new Error("Unequality refers to a different string.");
    }
    if (nesubstr.kind != "SNE") {
      throw new Error("Unequality of substrings is required.");
    }
    if (nesubstr.i != 1) {
      throw new Error("Left substring must be a prefix.");
    }
    if (nesubstr.j + nesubstr.k - 1 != qub.pfx) {
      throw new Error("Right substring must be a suffix of the prefix.");
    }
    if (nesubstr.k + 1 != qub.range[0]) {
      throw new Error("Only direct neighbour can be appended.");
    }
  };
  function result(qub, nesubstr) {
    return {
      kind : "QSNE",
      S : qub.S,
      pfx : qub.pfx,
      range : [qub.range[0] - 1, qub.range[1]]
    };
  }
  _.rule("Append to quantified unequal borders", checker, result);
}();


var tmp = function() {
  function checker(qub1, qub2) {
    isQuantifiedUnequalBorders(qub1);
    isQuantifiedUnequalBorders(qub2);
    if (qub1.S != qub2.S) {
      throw new Error("Unequality refers to a different string.");
    }
    if (qub1.pfx != qub2.pfx) {
      throw new Error("Unequality refers to a different prefix.");
    }
    if (qub1.range[1] + 1 != qub2.range[0]) {
      throw new Error("Only direct neighbour can be appended.");
    }
  };
  function result(qub1, qub2) {
    return {
      kind : "QSNE",
      S : qub1.S,
      pfx : qub1.pfx,
      range : [qub1.range[0], qub2.range[1]]
    };
  }
  _.rule("Merge quantified unequal borders", checker, result);
}();

var tmp = function() {
  function checker(qub) {
    isQuantifiedUnequalBorders(qub);
    isIndexOfString(qub.pfx + 1, qub.S);
  };
  function result(qub) {
    return {
      kind : "QSNE",
      S : qub.S,
      pfx : qub.pfx + 1,
      range : [qub.range[0] + 1, qub.range[1] + 1]
    };
  }
  _.rule("Extend quantified unequal borders", checker, result);
}();

var tmp = function() {
  function checker(qub, eqsubstr) {
    isQuantifiedUnequalBorders(qub);
    isSubstrCmp(eqsubstr);
    if (qub.S != eqsubstr.S) {
      throw new Error("Substring equality refers to a different string.");
    }
    if (eqsubstr.i != 1) {
      throw new Error("Left substring must be a prefix.");
    }
    if (eqsubstr.k != qub.pfx) {
      throw new Error("Left substring must cover the given prefix.");
    }
  };
  function result(qub, eqsubstr) {
    return {
      kind : "QSNE",
      S : qub.S,
      pfx : eqsubstr.j + eqsubstr.k - 1,
      range : qub.range
    };
  }
  _.rule("Translate quantified unequal borders", checker, result);
}();

var tmp = function() {
  function checker(brd, qub) {
    isBorder(brd);
    isQuantifiedUnequalBorders(qub);
    if (brd.S != qub.S) {
      throw new Error("Different strings.");
    }
    if (brd.pfx != qub.pfx) {
      throw new Error("Different prefixes.");
    }
    if (brd.len + 1 != qub.range[0]) {
      throw new Error("Given border is not maximal.");
    }
  };
  function result(brd, qub) {
    return {
      kind : "MAXBRD",
      S : qub.S,
      pfx : qub.pfx,
      len : brd.len
    };
  }
  _.rule("Maximal border", checker, result);
}();

function isMaxBorder(obj) {
  if (obj.kind != "MAXBRD") {
    throw new Error(obj + " is not a maximal border.");
  }
}

var tmp = function() {
  function checker(maxbrd) {
    isMaxBorder(maxbrd);
  };
  function result(maxbrd) {
    return {
      kind : "BRD",
      S : maxbrd.S,
      pfx : maxbrd.pfx,
      len : maxbrd.len
    };
  }
  _.rule("Border from maximal border", checker, result);
}();


var tmp = function() {
  function checker(maxbrd) {
    isMaxBorder(maxbrd);
  };
  function result(maxbrd) {
    return {
      kind : "QSNE",
      S : maxbrd.S,
      pfx : maxbrd.pfx,
      range : [maxbrd.len + 1, maxbrd.pfx - 1]
    };
  }
  _.rule("Quantified unequal borders from maximal border", checker, result);
}();

function main(S) {
  var B = [];
  B[1] = _("Maximal border", [_("Make border", [_("Empty equal substrings", [S, 1, 2])]), _("Vacuous quantified unequal borders", [S, 1])]);
  for (var i = 2; i <= S.length; i++) {
    var p = B[i - 1];
    var brd = _("Border from maximal border", [p]);
    var eqsubstr = _("Equal substrings from border", [brd]);
    var qsne = _("Quantified unequal borders from maximal border", [p]);
    qsne = _("Extend quantified unequal borders", [qsne]);
    brd = _("Make border", [_("Empty equal substrings", [S, 1, i + 1])]);
    while (p) {
      var cmp = _("Compare chars", [S, p.len + 1, i]);
      var strcmp = _("Extend substrings", [cmp, eqsubstr]);
      if (strcmp.kind == "SEQ") {
        brd = _("Make border", [strcmp]);
        break;
      } else {
        qsne = _("Append to quantified unequal borders", [qsne, strcmp]);
      }
      if (p.len == 0) break;
      p = B[p.len];
      var neweqsubstr = _("Equal substrings from border", [_("Border from maximal border", [p])]);
      var toTrans = _("Quantified unequal borders from maximal border", [p]);
      toTrans = _("Translate quantified unequal borders", [toTrans, eqsubstr]);
      eqsubstr = _("Translate subsubstring", [eqsubstr, neweqsubstr]);
      toTrans = _("Extend quantified unequal borders", [toTrans]);
      qsne = _("Merge quantified unequal borders", [toTrans, qsne]);
    }
    B[i] = _("Maximal border", [brd, qsne]);
  }
  $("#container").append(show(B));
}
