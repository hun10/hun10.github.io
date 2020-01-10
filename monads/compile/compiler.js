function compile(source) {
  const ex = expand(source)(x => undefined);
  return translate(Expander.run( ex.run )(1)[0]);
}

function translate(source) {
  if (source.t === "fun") {
    return `${source.name} => ${translate(source.body)}`;
  } else if (source.t === "app") {
    return `(${translate(source.fun)}) (${translate(source.arg)})`;
  } else if (source.t === "imp") {
    return `_imp (${translate(source.lhs)}) (${translate(source.rhs)})`;
  } else {
    return source;
  }
}

const expand = source => ctx => withMonad2(Expander)(pure => lazy => newId => {
  if (source.t === "fun") {
    return newId.flatMap(id => expand(source.body)(x => x === source.name ? 'v' + id : ctx(x)).map(bdy => ({
      t: "fun",
      name: 'v' + id,
      body: bdy,
    })));
  } else if (source.t === "app") {
    return expand(source.fun)(ctx).flatMap(fn => expand(source.arg)(ctx).flatMap(arg => {
      if (fn.t === "fun") {
        return expand(fn.body)(x => x === fn.name ? arg : ctx(x));
      } else {
        return pure({
          t: "app",
          fun: fn,
          arg: arg
        });
      }
    }));
  } else if (source.t === "imp") {
    return expand(source.lhs)(ctx).flatMap(lhs => expand(source.rhs)(ctx).flatMap(rhs => pure({
      t: "imp",
      lhs: lhs,
      rhs: rhs
    })));
  } else {
    return pure(ctx(source));
  }
});

const withMonad2 = Monad => body => {
  const apply = m => arg => Monad.bind(m)(f => Monad.bind(arg)(a => Monad.pure(f(a))));
  const fmap = f => apply(Monad.pure(f));

  const decorate = m => {
    const w = arg => decorate(apply(m)(arg.run));

    w.run = m;
    w.map = f => decorate(fmap(f)(m));
    w.flatMap = f => decorate(Monad.bind(m)(a => f(a).run));
    w.then = b => decorate(Monad.bind(m)(a => b.run));
    w.followedBy = b => decorate(Monad.bind(m)(a => Monad.bind(b.run)(x => Monad.pure(a))));

    return w;
  };

  const pure = a => decorate(Monad.pure(a));
  const lazy = pure(null).flatMap;
  const newId = decorate(Monad.newId);

  return body(pure)(lazy)(newId);
};

const Expander = {
  run: m => id => m(id),

  pure: a => id => [a, id],

  bind: m1 => f => id => {
    const r = Expander.run(m1)(id);
    return Expander.run(f(r[0]))(r[1]);
  },

  newId: id => [id, id + 1]
};
