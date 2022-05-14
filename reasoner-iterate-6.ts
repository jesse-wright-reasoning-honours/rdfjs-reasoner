import * as RDF from '@rdfjs/types';
import { forEachTerms, mapTerms, matchPatternMappings } from 'rdf-terms';
import { single, AsyncIterator, UnionIterator, ArrayIterator, fromArray } from './asynciterator/asynciterator';
import { maybeIterator, wrap } from './asynciterator/util';
import { ReduceIterator } from './asynciterator/mappingsIterator'
import { XProd } from './asynciterator/xrpod'

export async function reason(rules: Rule[], store: RDF.DatasetCore) {
  const nodes: IRuleNode[] = rules.map(rule => ({ rule, next: [] }));
    
  // Creating rule dependencies
  for (const n1 of nodes) {
    for (const n2 of nodes) {
      for (const conclusion of n1.rule.conclusion) {
        for (let i = 0; i < n2.rule.premise.length; i++) {
          const pattern = n2.rule.premise[i];
          if (matchPatternMappings(conclusion, pattern)) {
            n1.next.push({ rule: n2, index: i });
          }
        }
      }
    }
  }

  function runRule(rule: IRuleNode): {
    rule: IRuleNode;
    quads: AsyncIterator<RDF.Quad>;
} {
    const conclusion = rule.rule.conclusion;
    
    
    
    const res = applyMappings(rule, store).map<AsyncIterator<RDF.Quad>>(mapping => {
      const c = conclusion.map(conclusion => substituteQuad(conclusion, mapping))
        .filter(quad => store.has(quad) ? false : (store.add(quad), true))

      return fromArray(c)
    })

    return { rule, quads: new UnionIterator(res, { autoStart: false }) }
  }

  let results: AsyncIterator<{
    rule: IRuleNode;
    quads: AsyncIterator<RDF.Quad>;
  }> | null = fromArray(nodes).map(rule => runRule(rule));

  while ((results = await maybeIterator(results)) !== null) {
    const temp: AsyncIterator<AsyncIterator<{
      rule: IRuleNode;
      quads: AsyncIterator<RDF.Quad>;
    }>> = results.map(result => new XProd(result.rule.next, result.quads, maybeSubstitute).map(s => runRule(s)));
    results = new UnionIterator(temp, { autoStart: false })
  }
}

function nullifyVariables(term: RDF.Term) {
  return !term || term.termType === 'Variable' ? undefined : term;
}

export function substituteQuad(term: RDF.Quad, mapping: Mapping): RDF.Quad {
  // TODO: Fix the as any required to meed the Algebra.Pattern requirement
  // Should be able to do this once https://github.com/comunica/comunica/issues/999 is resolved.
  return mapTerms(term, elem => elem.termType === 'Variable' && elem.value in mapping ? mapping[elem.value] : elem) as any;
}

function getMappings(store: RDF.DatasetCore, cause: RDF.Quad, mapping: Mapping | null) {
  return wrap<RDF.Quad>(store.match(
    nullifyVariables(cause.subject) as any,
    nullifyVariables(cause.predicate) as any,
    nullifyVariables(cause.object) as any,
    nullifyVariables(cause.graph) as any,
  ) as any, { letIteratorThrough: true, prioritizeIterable: true }).map(quad => {
    let localMapping: Mapping | null = {};

    forEachTerms(cause, (term, key) => {
      if (term.termType === 'Variable' && localMapping) {
        if (term.value in localMapping && !localMapping[term.value].equals((quad as any)[key])) {
          localMapping = null;
        } else {
          localMapping[term.value] = (quad as any)[key];
        }
      }
    });
    return localMapping && (mapping ? Object.assign(localMapping, mapping) : localMapping);
  });
}

function applyMappings(rule: IRuleNode, store: RDF.DatasetCore): AsyncIterator<Mapping> {
  const { premise, conclusion } = rule.rule;
  switch(premise.length) {
    case 0: return new ArrayIterator<Mapping>([{}], { autoStart: false });
    case 1: return getMappings(store, premise[0], null);
    default: return new ReduceIterator(premise, (m, p) => getMappings(store, m ? substituteQuad(p, m) : p, m));
  }
}

// class XProd<A, B, C> extends AsyncIterator<C> {
//   private i: number;
//   private item: B | null = null;
//   private setReadable = () => {
//     if (this.readable)
//       this.emit('readable');
//     else
//       this.readable = true;
//   };
//   constructor(private arr: A[], private iter: AsyncIterator<B>, private f: (a: A, b: B) => C) {
//     super()
//     this.i = arr.length - 1;
//     iter.on('readable', this.setReadable);
//     iter.on('end', this.setReadable);
//   }

//   close() {
//     this.iter.removeListener('readable', this.setReadable);
//     this.iter.removeListener('end', this.setReadable);
//     super.close();
//   }

//   read(): C | null {
//     if (this.i === this.arr.length - 1) {
//       if ((this.item = this.iter.read()) === null) {
//         if (this.iter.done) {
//           this.close();
//         }
//         return null;
//       }
//       this.i = -1;
//     }
//     return this.f(this.arr[this.i++], this.item!)
//   }
// }

// class MyIterator extends AsyncIterator<Mapping> {
//   // private baseMappings: AsyncIterator<Mapping>;
//   private iterators: AsyncIterator<Mapping>[];
//   private iterator?: AsyncIterator<Mapping>;
//   private setReadable = () => {
//     if (this.readable)
//       this.emit('readable');
//     else
//       this.readable = true;
//   };
//   private i = 0;
//   constructor(private store: RDF.DatasetCore, private premises: RDF.Quad[]) {
//     super()

//     if (premises.length < 2)
//       throw new Error('Expected at least 2 premises');

//     this.iterators = new Array(premises.length - 1);
//     this.iterators[0] = getMappings(this.store, this.premises[0]);
//   }

//   read(): Mapping | null {
//     let item: Mapping | null;
//     while (this.i !== -1) {
//       if (this.i === this.premises.length - 1 && (item = this.iterators[this.i].read()) !== null)
//         return item;

//       let changed = false;
//       // Backtrack to the last iterator that is not done
//       while (this.i >= 0 && this.iterators[this.i].done) {
//         changed ||= true;
//         this.i--;
//       }

//       // Build back forward as far as possible
//       while (this.i < this.premises.length - 1 && (item = this.iterators[this.i].read()) !== null) {
//         changed ||= true;
//         this.iterators[this.i++] = getMappings(this.store, substituteQuad(this.premises[this.i], item), item);
//       }

//       // Current strategy to break out when 
//       if (!changed)
//         break;
//     }
//     if (this.done) {
//       if (this.iterator) {
//         this.iterator.removeListener('readable', this.setReadable);
//         this.iterator.removeListener('end', this.setReadable);
//       }
//       // @ts-ignore
//       delete this.iterators;
//       this.close();
//     }
//     if (this.iterator !== this.iterators[this.i]) {
//       this.iterator?.removeListener('readable', this.setReadable);
//       this.iterator?.removeListener('end', this.setReadable);
//       this.iterator = this.iterators[this.i];
//       this.iterator?.addListener('readable', this.setReadable);
//       this.iterator?.addListener('end', this.setReadable);
//     }
//     return null;
//   }
// }


// 1 - We only need to reflect the 'readability' of the most top-level iterator
// that is not currently completed

// 2 - Should only be done once *all* iterators in the queue are in a done state

// 

function substitute(quad: RDF.Quad, map:  Record<string, RDF.Term>): RDF.Quad {
  return mapTerms(quad, (term) => term.termType === 'Variable' && term.value in map ? map[term.value] : term);
}

function maybeSubstitute({ rule: { rule, next }, index }: { rule: IRuleNode, index: number }, quad: RDF.Quad): IRuleNode | null {
  let mapping: Record<string, RDF.Term> | null = {};
  const pattern = rule.premise[index];

  forEachTerms(pattern, (term, name) => {
    if (term.termType !== 'Variable') {
      // Verify that it is a valid match
      if (!term.equals(quad[name])) {
        mapping = null;
      return;
      }
    }

    if (mapping) {
      if (term.value in mapping) {
        if (!quad[name].equals(mapping[term.value])) {
          mapping = null;
        }
      } else {
        mapping[term.value] = quad[name];
      }
    }
  });

  if (mapping === null) {
    return null;
  }

  const premise: RDF.Quad[] = [];

  for (let i = 0; i < rule.premise.length; i++) {
    if (i !== index) {
      premise.push(substitute(rule.premise[i], mapping));
    }
  }

  const conclusion = rule.conclusion && rule.conclusion.map(conclusion => substitute(conclusion, mapping!));

  const res: IRuleNode = {
    rule: {
      // TODO: See if we can just use the existing rule type
      ruleType: 'rdfs',
      premise,
      conclusion
    },
    next
  }

  return res;
}



interface IRuleNode {
  rule: Rule;
  next: { rule: IRuleNode, index: number }[];
}

interface IConsequenceData {
  quads: AsyncIterator<RDF.Quad>;
  rule: IRuleNode;
}

export interface Rule {
  ruleType: string,
  premise: RDF.Quad[];
  conclusion: RDF.Quad[];
}

type Mapping = Record<string, RDF.Term>;

