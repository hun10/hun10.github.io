function compile(source) {
  return translate(garble(source));
}

function translate(source) {
  if (source.t === "fun") {
    return `${source.name} => ${translate(source.body)}`;
  } else if (source.t === "app" && source.fun.t === "fun") {
    return `(${translate(source.fun)}) (${translate(source.arg)})`;
  } else if (source.t === "app") {
    return `${translate(source.fun)} (${translate(source.arg)})`;
  } else {
    return source;
  }
}

const garble = (() => {
  function rec(src, ctx, id) {
    if (src.t === "fun") {
      const nm = 'v' + id;

      return {
        t: "fun",
        name: nm,
        body: rec(src.body, e => e === src.name ? nm : ctx(e), id + 1)
      };
    } else if (src.t === "app") {
      return {
        t: "app",
        fun: rec(src.fun, ctx, id),
        arg: rec(src.arg, ctx, id)
      };
    } else {
      return ctx(src);
    }
  }

  return s => rec(s, e => e, 0);
})();
