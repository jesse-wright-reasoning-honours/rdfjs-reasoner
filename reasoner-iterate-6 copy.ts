import * as RDF from '@rdfjs/types';
import { forEachTerms, mapTerms, matchPatternMappings } from 'rdf-terms';
import { single, AsyncIterator, UnionIterator, ArrayIterator, fromArray } from './asynciterator/asynciterator';
import { maybeIterator, wrap } from './asynciterator/util';

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
    }>> = results.map<AsyncIterator<{
      rule: IRuleNode;
      quads: AsyncIterator<RDF.Quad>;
    }>>(result => {
      const d = result.quads.map(quad => {
        return fromArray(result.rule.next
          .map(rule => maybeSubstitute(rule, quad))
          .filter(elem => elem !== null)
          .map(s => runRule(s as any))) as AsyncIterator<{
            rule: IRuleNode;
            quads: AsyncIterator<RDF.Quad>;
          }>
      });
      return new UnionIterator(d, { autoStart: false })
    });

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

function getMappings(store: RDF.DatasetCore, cause: RDF.Quad, mapping?: Mapping) {
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
  if (premise.length === 0)
    return new ArrayIterator<Mapping>([], { autoStart: false });

  let mappings = getMappings(store, premise[0]);

  for (let i = 1; i < premise.length; i++) {
    mappings = new UnionIterator(
      mappings.map(mapping => getMappings(store, substituteQuad(premise[i], mapping), mapping)),
      { autoStart: false }
    )
  }

  return mappings;
}

class MyIterator extends AsyncIterator<Mapping> {
  // private baseMappings: AsyncIterator<Mapping>;
  private iterators: AsyncIterator<Mapping>[];
  private iterator?: AsyncIterator<Mapping>;
  private setReadable = () => {
    if (this.readable)
      this.emit('readable');
    else
      this.readable = true;
  };
  private i = 0;
  constructor(private store: RDF.DatasetCore, private premises: RDF.Quad[]) {
    super()

    if (premises.length < 2)
      throw new Error('Expected at least 2 premises');

    this.iterators = new Array(premises.length - 1);
    this.iterators[0] = getMappings(this.store, this.premises[0]);
  }

  read(): Mapping | null {
    let item: Mapping | null;
    while (this.i !== -1) {
      if (this.i === this.premises.length - 1 && (item = this.iterators[this.i].read()) !== null)
        return item;

      let changed = false;
      // Backtrack to the last iterator that is not done
      while (this.i >= 0 && this.iterators[this.i].done) {
        changed ||= true;
        this.i--;
      }

      // Build back forward as far as possible
      while (this.i < this.premises.length - 1 && (item = this.iterators[this.i].read()) !== null) {
        changed ||= true;
        this.iterators[this.i++] = getMappings(this.store, substituteQuad(this.premises[this.i], item), item);
      }

      // Current strategy to break out when 
      if (!changed)
        break;
    }
    if (this.done) {
      if (this.iterator) {
        this.iterator.removeListener('readable', this.setReadable);
        this.iterator.removeListener('end', this.setReadable);
      }
      // @ts-ignore
      delete this.iterators;
      this.close();
    }
    if (this.iterator !== this.iterators[this.i]) {
      this.iterator?.removeListener('readable', this.setReadable);
      this.iterator?.removeListener('end', this.setReadable);
      this.iterator = this.iterators[this.i];
      this.iterator?.addListener('readable', this.setReadable);
      this.iterator?.addListener('end', this.setReadable);
    }
    return null;
    
    
    
    
    
    
    
    
    
    
    
    // get next mapping from base mapping
    if (this.i === 0) {
      if (this.iterators[0].done) {
        this.close();
        return null;
      }

      // this.iterators[this.i] = getMappings(this.store, substituteQuad(this.premises[this.i], item), item)

      // if ((item = this.baseMappings.read()) !== null) {
      //   this.iterators[0] = getMappings(this.store, this.premises[0])
      // }
    }

    while (this.i < this.premises.length - 1) {
      if ((item = this.iterators[this.i].read()) === null)
        break;
      
      this.iterators[this.i++] = getMappings(this.store, substituteQuad(this.premises[this.i], item), item);
    }

    while (this.i >= 0 && this.iterators[this.i].done) {
      this.i--;
      if (this.i === -1) {
        // @ts-ignore
        delete this.iterators;
        this.close();
        return null;
      }
    }
  }
}


// 1 - We only need to reflect the 'readability' of the most top-level iterator
// that is not currently completed

// 2 - Should only be done once *all* iterators in the queue are in a done state

// 

class MappingsIterator extends AsyncIterator<Mapping> {
  // private data?: { mapping: Mapping, iterator: AsyncIterator<Mapping> }[];
  private data: AsyncIterator<Mapping>[]
  private premise: RDF.Quad[];
  constructor(rule: IRuleNode, private store: RDF.DatasetCore) {
    super()

    const premise = this.premise = rule.rule.premise;
    this.data = new Array(premise.length);
    this.data[0] = getMappings(store, premise[0]);
    
    // for (let i = 1; i < this.premise.length; i++) {
    //   this.data[i] = getMappings(this.data[i-1].read(), premise[i])
    // }
  }

  backwards(index: number) {
    let item: Mapping | null;
    while (index-- >= 0) {
      if ((item = this.data[index].read()) !== null) {
        return item;
      }
    }
  }

  forwards(index: number) {

  }

  read(): Mapping | null {
    let i = this.data.length - 1;
    let item: Mapping | null;

    while ((item = this.data[i].read()) !== null) {
      if (i === this.data.length)
        return item;

      
    }

    if ((item = this.data[i].read()) !== null) {
      return item;
    }

    // If the iterator is not done then we return null
    if (!this.data[i].done)
      return null;

    while (i-- >= 0) {
      item = this.data[i].read();
      if (item === null) {
        // If the iterator is not done then we return null
        if (!this.data[i].done)
          return null;
      } else {
        // Build back up
        while (i++ < this.data.length - 1) {
          this.data[i] = getMappings(this.store, substituteQuad(this.premise[i], item), item)
          if ((item = this.data[i].read()) === null)
            break;
        }
      }

      // 


      // If i === this.data.length - 1 then we are back to the top le
      if (i === this.data.length - 1) {
        return item;
      }
    }
  }
}

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

