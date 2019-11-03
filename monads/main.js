const main = source => withMonad(Parser)(pure => lazy => read => fail => {
  const cons = pure(a => b => [a].concat(b));
  const mid = pure(a => b => c => b);

  const many = m => cons (m) (lazy(() => many(m))) .or (pure([]));

  const ws = read(/^\s*/u);

  const leftP = read(/\(/u);
  const rightP = read(/\)/u);
  const parenthesis = mid (leftP) (lazy(() => E)) (rightP);

  const lmd = pure(s => a => b => ({name: a, body: b})) (read(/\\/u)) (read(/[^\s]+/u)) (lazy(() => E));

  const name = read(/^(?:.*?)(?=\\[^\s]+|->|$|\s|\(|\))/u).flatMap(x => x.length > 0 ? pure(x) : fail);
  const atom = mid (ws) (name) (ws) .or (parenthesis) .or (lmd);

  function App(a, b) {
    if (b.length > 0) {
      return App({to: a, app: b[0]}, b.slice(1));
    } else {
      return a;
    }
  }

  const A = pure(a => b => App(a, b)) (atom) (many(atom));

  const arrow = mid (ws) (read(/^->/u)) (ws);

  const E = pure(a => b => c => ({lhs: a, rhs: c})) (A) (arrow) (lazy(() => E)) .or (A);

  return E.run(source);
});

const withMonad = Monad => body => {
  const apply = m => arg => Monad.bind(m)(f => Monad.bind(arg)(a => Monad.pure(f(a))));
  const fmap = f => apply(Monad.pure(f));

  const decorate = m => {
    const w = arg => decorate(apply(m)(arg.run));

    w.run = m;
    w.map = f => decorate(fmap(f)(m));
    w.flatMap = f => decorate(Monad.bind(m)(a => f(a).run));
    w.or = w2 => decorate(Monad.either(m)(w2.run));

    return w;
  };

  const pure = a => decorate(Monad.pure(a));
  const lazy = pure(null).flatMap;
  const read = p => decorate(Monad.read(p));
  const fail = decorate(Monad.fail);

  return body(pure)(lazy)(read)(fail);
};

const Parser = {
  pure: a => i => [a, i],

  read: pattern => i => {
    const m = i.match(pattern);
    if (m && m.index === 0) {
      return [m[0], i.slice(m[0].length)];
    } else {
      return null;
    }
  },

  fail: i => null,

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
