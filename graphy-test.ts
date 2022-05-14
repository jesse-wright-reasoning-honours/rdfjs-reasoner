const dataset = require('@graphy/memory.dataset.fast');
import { Quad, NamedNode } from 'n3';

const d = dataset();

d.has(
  new Quad(
    new NamedNode('http://eulersharp.sourceforge.net/2009/12dtb/test#ind'),
    new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    new NamedNode('http://eulersharp.sourceforge.net/2009/12dtb/test#N0'),
  )
);



// d.add(
//   new Quad(
//     new NamedNode('http://eulersharp.sourceforge.net/2009/12dtb/test#ind'),
//     new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
//     new NamedNode('http://eulersharp.sourceforge.net/2009/12dtb/test#N0'),
//   )
// );


const m = d.match(
  new NamedNode('http://eulersharp.sourceforge.net/2009/12dtb/test#ind'),
  null,
  new NamedNode('http://eulersharp.sourceforge.net/2009/12dtb/test#N0'),
)

// for (const e of m) {
//   console.log(e)
// }

