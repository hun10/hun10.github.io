function compile(source) {
  if (typeof source === "string") {
    return source;
  } else if (source.t === "fun") {
    return `${source.name} => ${compile(source.body)}`;
  } else if (source.t === "app") {
    return `(${compile(source.fun)}) (${compile(source.arg)})`;
  } else if (source.t === "imp") {
    return `$_imp ({compile(source.lhs)}) (${compile(source.rhs)})`;
  } else {
    return "ERROR!";
  }
}
