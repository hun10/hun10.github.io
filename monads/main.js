const main = () => withMonad(Parser)(pure => lazy => read => {
  const E = pure(a => b => [a].concat(b))(read)(lazy(() => E)).orElse(pure([]));
  return E.run("abcdef");
});

const withMonad = Monad => body => {
  const apply = m => arg => Monad.bind(m)(f => Monad.bind(arg)(a => Monad.pure(f(a))));
  const fmap = f => apply(Monad.pure(f));

  const decorate = m => {
    const w = arg => decorate(apply(m)(arg.run));

    w.run = m;
    w.map = f => decorate(fmap(f)(m));
    w.flatMap = f => decorate(Monad.bind(m)(a => f(a).run));
    w.orElse = w2 => decorate(Monad.either(m)(w2.run));

    return w;
  };

  const pure = a => decorate(Monad.pure(a));
  const lazy = pure(null).flatMap;
  const read = decorate(Monad.read);

  return body(pure)(lazy)(read);
};

const Parser = {
  pure: a => i => [a, i],

  read: i => {
    const m = i.match(/./u);
    if (m) {
      return [m[0], i.slice(m[0].length)];
    } else {
      return null;
    }
  },

  bind: p1 => f => i => {
    const r1 = p1(i);

    if (r1) {
      return f(r1[0])(r1[1]);
    } else {
      return null;
    }
  },

  either: p1 => p2 => i => {
    const r1 = p1(i);

    if (r1) {
      return r1;
    } else {
      return p2(i);
    }
  }
};
