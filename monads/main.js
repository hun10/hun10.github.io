const main = source => withMonad(Parser)(pure => lazy => read => fail => {
  const many = cons => zero => m => {
    const pCons = pure(cons);
    const pZero = pure(zero);
    const rec = pCons (m) (lazy(() => rec)) .or (pZero);
    return rec;
  };

  const many1 = cons => zero => m => pure(cons) (m) (many(cons)(zero)(m))

  const ignoreAll = many(a => b => null)(null);
  const list = many(a => b => [a, b])(null);
  const text = many1(a => b => a + b)("");

  const readTest = test => read.flatMap(c => test(c) ? pure(c) : fail);
  const readChar = c => readTest(x => x === c);

  const wsChar = readTest(c => /\s/u.test(c));
  const ws = ignoreAll(wsChar);
  const leftP = readChar("(");
  const rightP = readChar(")");
  const slash = readChar("\\");
  const arrow = readChar("-") .then (readChar(">"));

  const parenthesis = leftP .then (lazy(() => E)) .followedBy (rightP);

  const blocker = wsChar.or(leftP).or(rightP).or(slash).or(arrow);
  const letter = blocker.negativeAhead().then(read);

  const name = text(letter);

  const lmd = pure(s => a => b => ({name: a, body: b})) (slash) (name) (lazy(() => E));

  const atom = ws .then ((lmd) .or (parenthesis) .or (name));

  function App(f, list) {
    while (list) {
      f = {
        fun: f,
        arg: list[0]
      };
      list = list[1];
    }

    return f;
  }

  const A = pure(a => b => App(a, b)) (atom) (list(atom));

  const E = pure(a => c => ({lhs: a, rhs: c})) (A .followedBy (ws) .followedBy (arrow)) (lazy(() => E)) .or (A);

  const S = E .followedBy (ws);

  return Parser.run(S.run)(source);
});

const withMonad = Monad => body => {
  const apply = m => arg => Monad.bind(m)(f => Monad.bind(arg)(a => Monad.pure(f(a))));
  const fmap = f => apply(Monad.pure(f));

  const decorate = m => {
    const w = arg => decorate(apply(m)(arg.run));

    w.run = m;
    w.map = f => decorate(fmap(f)(m));
    w.flatMap = f => decorate(Monad.bind(m)(a => f(a).run));
    w.then = b => decorate(Monad.bind(m)(a => b.run));
    w.followedBy = b => decorate(Monad.bind(m)(a => Monad.bind(b.run)(x => Monad.pure(a))));
    w.or = w2 => decorate(Monad.either(m)(w2.run));
    w.negativeAhead = () => decorate(Monad.negativeAhead(m));

    return w;
  };

  const pure = a => decorate(Monad.pure(a));
  const lazy = pure(null).flatMap;
  const read = decorate(Monad.read);
  const fail = decorate(Monad.fail);

  return body(pure)(lazy)(read)(fail);
};

const Trampoline = {
  pure: a => ({
    just: a
  }),

  bind: ta => fab => ({
    more: () => {
      if (ta.more) {
        return Trampoline.bind(ta.more())(fab);
      } else {
        return fab(ta.just);
      }
    }
  }),

  run: t => {
    while (t.more) {
      t = t.more();
    }

    return t.just;
  }
};

const Parser = {
  run: p => i => Trampoline.run(p(i)),

  pure: a => e => Trampoline.pure([a, e]),

  read: e => {
    if (e) {
      return Trampoline.pure([e[0], e[1]]);
    } else {
      return Trampoline.pure(null);
    }
  },

  fail: e => Trampoline.pure(null),

  bind: p1 => f => e1 => Trampoline.bind(p1(e1))(r1 => {
    if (r1) {
      return f(r1[0])(r1[1]);
    } else {
      return Trampoline.pure(null);
    }
  }),

  either: p1 => p2 => e1 => Trampoline.bind(p1(e1))(r1 => {
    if (r1) {
      return Trampoline.pure(r1);
    } else {
      return p2(e1);
    }
  }),

  negativeAhead: p1 => e1 => Trampoline.bind(p1(e1))(r1 => {
    if (r1) {
      return Trampoline.pure(null);
    } else {
      return Trampoline.pure([null, e1]);
    }
  })
};
