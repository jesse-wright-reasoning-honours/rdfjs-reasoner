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

  read(): Mapping | null {
    let i = this.data.length - 1;
    let item: Mapping | null;

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
        while (i++ < this.data.length -1) {
          this.data[i] = getMappings(this.store, substituteQuad(this.premise[i], item), item)
          item = this.data[i].read();
        }
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

