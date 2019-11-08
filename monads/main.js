const main = source => withMonad(Parser)(pure => lazy => read => fail => {
  const cons = pure(a => b => [a, b]);
  const fst = pure(a => b => a);
  const snd = pure(a => b => b);
  const mid = pure(a => b => c => b);
  const many = m => cons (m) (lazy(() => many(m))) .or (pure(null));

  const readTest = test => read.flatMap(c => test(c) ? pure(c) : fail);
  const readChar = c => readTest(x => x === c);

  const wsChar = readTest(c => /\s/u.test(c));
  const ws = many(wsChar);
  const leftP = readChar("(");
  const rightP = readChar(")");
  const slash = readChar("\\");
  const arrow = readChar("-") .then (readChar(">"));

  const parenthesis = mid (leftP) (lazy(() => E)) (rightP);

  const blocker = wsChar.or(leftP).or(rightP).or(slash).or(arrow);
  const letter = blocker.negativeAhead().then(read);

  function makeString(list) {
    let s = "";

    while (list) {
      s += list[0];
      list = list[1];
    }

    return s;
  }

  const name = cons (letter) (many(letter)) .map (makeString);

  const lmd = pure(s => a => b => ({name: a, body: b})) (slash) (name) (lazy(() => E));

  const atom = snd (ws) ((lmd) .or (parenthesis) .or (name));

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

  const A = pure(a => b => App(a, b)) (atom) (many(atom));

  const E = (pure(a => b => c => ({lhs: a, rhs: c})) (A) (arrow) (lazy(() => E)) .or (A));

  const S = fst (E) (ws)

  return S.run(source);
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
  pure: a => i => [a, i],

  read: i => {
    const m = i.match(/^.|^\s/u);
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
  },

  negativeAhead: p1 => i => {
    const r1 = p1(i);

    if (r1) {
      return null;
    } else {
      return [null, i];
    }
  }
};
