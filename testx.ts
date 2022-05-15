for (let i = 0; i < 1_000_000_000; i++) {
  const x = []
}

let y;
for (let i = 0; i < 1_000_000_000; i++) {
  y = []
}

console.time('array creation')
for (let i = 0; i < 1_000_000_000; i++) {
  y = []
}
console.log(y)
console.timeEnd('array creation')

console.time('object creation')
let z
for (let i = 0; i < 1_000_000_000; i++) {
  z = {}
}
console.timeEnd('object creation')

console.time('array creation 1')
for (let i = 0; i < 1_000_000_000; i++) {
  y = [{}, {}, {}]
}
console.timeEnd('array creation 1')

console.time('object creation 1')
for (let i = 0; i < 1_000_000_000; i++) {
  y = { subject: {}, predicate: {}, object: {} }
}
console.timeEnd('object creation 1')


console.time('array creation 2')
for (let i = 0; i < 1_000_000_000; i++) {
  y = [{ value: 1 }, { value: 1 }, { value: 1 }]
}
console.timeEnd('array creation 2')

console.time('object creation 2')
for (let i = 0; i < 1_000_000_000; i++) {
  y = { subject: { value: 1 }, predicate: { value: 1 }, object: { value: 1 } }
}
console.timeEnd('object creation 2')


console.time('array creation 3')
let x: any = {}
for (let i = 0; i < 1_000_000_000; i++) {
  x[1] = {}
}
console.timeEnd('array creation 3')

console.time('a')
for (let i = 0; i < 10_000_000; i++) {
  const x = { a: 1 }
  const y = { b: 1 }
  Object.assign(x, y)
}
console.timeEnd('a')

console.time('b')
for (let i = 0; i < 10_000_000; i++) {
  const x: any = { a: 1 }
  const y: any = { b: 1 }
  for (const key in x)
    y[key] = x[key]
}
console.timeEnd('b')


console.time('c')
for (let i = 0; i < 10_000_000; i++) {
  const x: any = { a: 1, a1: 1, a2: 1 }
  const y: any = { b: 1, b1: 1, b2: 1 }
  for (const key in x)
    if (typeof key === 'string')
      y[key] = x[key]
}
console.timeEnd('c')

