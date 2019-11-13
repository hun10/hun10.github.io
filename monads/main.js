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

const Parser = {
  run: p => i => {
    let e = {
      i: i
    };

    let cont = [p, null];

    while (cont) {
      const modE = cont[0](e);
      cont = cont[1];

      e = {
        a: modE.a,
        i: modE.i,
        error: modE.error
      };

      if (modE.cont) {
        cont = modE.cont(cont);
      }
    }

    return e.error ? null : [e.a, e.i];
  },

  pure: a => e => ({a: a, i: e.i}),

  read: e => {
    if (e.i) {
      return {a: e.i[0], i: e.i[1]};
    } else {
      return {error: true};
    }
  },

  fail: e => ({error: true}),

  bind: p1 => f => e1 => ({
    cont: tail => [
      e => p1(e1),
      [e2 => e2.error ? {error: true} : f(e2.a)(e2), tail]
    ]
  }),

  either: p1 => p2 => e1 => ({
    cont: tail => [
      e => p1(e1),
      [e2 => e2.error ? p2(e1) : e2, tail]
    ]
  }),

  negativeAhead: p1 => e1 => ({
    cont: tail => [
      e => p1(e1),
      [e2 => e2.error ? e1 : {error: true}, tail]
    ]
  })
};
