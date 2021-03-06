import { Store, Quad, NamedNode, Variable, Parser } from 'n3';
import * as fs from 'fs';
import * as path from 'path';
import { reason } from './reasoner'

function generateDeepTaxonomy(size: number) {
  const store = new Store();

  store.addQuads([
    new Quad(
      new NamedNode('http://eulersharp.sourceforge.net/2009/12dtb/test#ind'),
      new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new NamedNode('http://eulersharp.sourceforge.net/2009/12dtb/test#N0'),
    ),
  ]);

  store.addQuads([
    new Quad(
      new NamedNode(`http://eulersharp.sourceforge.net/2009/12dtb/test#N${size}`),
      new NamedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
      new NamedNode('http://eulersharp.sourceforge.net/2009/12dtb/test#A2'),
    ),
  ]);

  for (let i = 0; i < size; i++) {
    store.addQuads([
      new Quad(
        new NamedNode(`http://eulersharp.sourceforge.net/2009/12dtb/test#N${i}`),
        new NamedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
        new NamedNode(`http://eulersharp.sourceforge.net/2009/12dtb/test#N${i + 1}`),
      ),
      new Quad(
        new NamedNode(`http://eulersharp.sourceforge.net/2009/12dtb/test#N${i}`),
        new NamedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
        new NamedNode(`http://eulersharp.sourceforge.net/2009/12dtb/test#I${i + 1}`),
      ),
      new Quad(
        new NamedNode(`http://eulersharp.sourceforge.net/2009/12dtb/test#N${i}`),
        new NamedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
        new NamedNode(`http://eulersharp.sourceforge.net/2009/12dtb/test#J${i + 1}`),
      ),
    ]);
  }

  return store;
}


const SUBCLASS_RULE = [{
  premise: [new Quad(
    new Variable('?s'),
    new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    new Variable('?o'),
  ), new Quad(
    new Variable('?o'),
    new NamedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
    new Variable('?o2'),
  )],
  conclusion: [
    new Quad(
      new Variable('?s'),
      new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      new Variable('?o2'),
    ),
  ],
}];

const RDFS_RULE = [{
  premise: [new Quad(
  new Variable('?s'),
  new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
  new Variable('?o')
), new Quad(
  new Variable('?o'),
  new NamedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
  new Variable('?o2')
)],
  conclusion: [
    new Quad(
    new Variable('?s'),
    new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    new Variable('?o2')
  ),
  ],
},
{
  premise: [new Quad(
  new Variable('?s'),
  new Variable('?p'),
  new Variable('?o')
)],
  conclusion: [
    new Quad(
    new Variable('?p'),
    new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#Property')
  ),
  ],
},
{
  premise: [new Quad(
  new Variable('?a'),
  new NamedNode('http://www.w3.org/2000/01/rdf-schema#domain'),
  new Variable('?x')
), new Quad(
  new Variable('?u'),
  new Variable('?a'),
  new Variable('?y')
)],
  conclusion: [
    new Quad(
    new Variable('?u'),
    new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    new Variable('?x')
  ),
  ],
},
{
  premise: [new Quad(
  new Variable('?a'),
  new NamedNode('http://www.w3.org/2000/01/rdf-schema#range'),
  new Variable('?x')
), new Quad(
  new Variable('?u'), // With rules like this we *do not* need to iterate over the subject index so we should avoid doing so
  new Variable('?a'),
  new Variable('?v')
)],
  conclusion: [
    new Quad(
    new Variable('?v'),
    new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    new Variable('?x')
  ),
  ],
},
{
  premise: [new Quad(
  new Variable('?u'),
  new Variable('?a'),
  new Variable('?x')
)],
  conclusion: [
    new Quad(
    new Variable('?u'),
    new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    new NamedNode('http://www.w3.org/2000/01/rdf-schema#Resource')
  ),
    new Quad(
    new Variable('?x'),
    new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    new NamedNode('http://www.w3.org/2000/01/rdf-schema#Resource')
  ),
  ],
},
{
  premise: [new Quad(
  new Variable('?u'),
  new NamedNode('http://www.w3.org/2000/01/rdf-schema#subPropertyOf'),
  new Variable('?v')
), new Quad(
  new Variable('?v'),
  new NamedNode('http://www.w3.org/2000/01/rdf-schema#subPropertyOf'),
  new Variable('?x')
)],
  conclusion: [
    new Quad(
    new Variable('?u'),
    new NamedNode('http://www.w3.org/2000/01/rdf-schema#subPropertyOf'),
    new Variable('?x')
  ),
  ],
},
{
  premise: [new Quad(
  new Variable('?u'),
  new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
  new NamedNode('http://www.w3.org/2000/01/rdf-schema#Class')
)],
  conclusion: [
    new Quad(
    new Variable('?u'),
    new NamedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
    new NamedNode('http://www.w3.org/2000/01/rdf-schema#Resource')
  ),
  ],
},
{
  premise: [new Quad(
  new Variable('?u'),
  new NamedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
  new Variable('?x')
), new Quad(
  new Variable('?v'),
  new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
  new Variable('?u')
)],
  conclusion: [
    new Quad(
    new Variable('?v'),
    new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    new Variable('?x')
  ),
  ],
}, {
  premise: [new Quad(
  new Variable('?u'),
  new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
  new NamedNode('http://www.w3.org/2000/01/rdf-schema#Class')
)],
  conclusion: [
    new Quad(
    new Variable('?u'),
    new NamedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
    new Variable('?u')
  ),
  ],
},
{
  premise: [new Quad(
  new Variable('?u'),
  new NamedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
  new Variable('?v')
), new Quad(
  new Variable('?v'),
  new NamedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
  new Variable('?x')
)],
  conclusion: [
    new Quad(
    new Variable('?u'),
    new NamedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
    new Variable('?x')
  ),
  ],
}, {
  premise: [new Quad(
  new Variable('?u'),
  new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
  new NamedNode('http://www.w3.org/2000/01/rdf-schema#ContainerMembershipProperty')
)],
  conclusion: [
    new Quad(
    new Variable('?u'),
    new NamedNode('http://www.w3.org/2000/01/rdf-schema#subPropertyOf'),
    new NamedNode('http://www.w3.org/2000/01/rdf-schema#member')
  ),
  ],
},
{
  premise: [new Quad(
  new Variable('?u'),
  new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
  new NamedNode('http://www.w3.org/2000/01/rdf-schema#Datatype')
)],
  conclusion: [
    new Quad(
    new Variable('?u'),
    new NamedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
    new NamedNode('http://www.w3.org/2000/01/rdf-schema#Literal')
  ),
  ],
},
];

function load(filename: string, store: Store) {
  return new Promise<void>(res => {
    new Parser({ baseIRI: 'http://example.org' }).parse(fs.createReadStream(filename) as any, (error, quad) => {
      if (quad)
        store.add(quad);
      else {
        res();
      }
    });
  });
}

async function deepTaxonomy() {
  for (let i = 1; i <= 6; i++) {
    const TITLE = `test-dl-${10 ** i}.n3`;
    const store = generateDeepTaxonomy(10 ** i);

    console.time(`Reasoning: ${TITLE}`);
    reason(SUBCLASS_RULE as any, store);
    console.timeEnd(`Reasoning: ${TITLE}`);
  }
}

async function run() {
  const store = new Store();
  console.time('loading foaf ontology');
  await load(path.join(__dirname, './data/foaf.ttl'), store);
  console.timeEnd('loading foaf ontology');

  console.time('loading tim berners lee profile card');
  await load(path.join(__dirname, './data/timbl.ttl'), store);
  console.timeEnd('loading tim berners lee profile card');

  console.time('Reasoning');
  reason(RDFS_RULE as any, store);
  console.timeEnd('Reasoning');
}

(async () => {
  console.log('Reasoning over TimBL profile and FOAF');
  await run();

  console.log('\nRunning Deep Taxonomy Benchmark');
  await deepTaxonomy();
})();
