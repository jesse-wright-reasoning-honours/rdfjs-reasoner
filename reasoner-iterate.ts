import * as RDF from '@rdfjs/types';
import { forEachTerms, mapTerms, matchPatternMappings } from 'rdf-terms';
import { single, wrap, AsyncIterator, UnionIterator } from 'asynciterator';

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

  const nexts = []

  async function runRule(rule: IRuleNode) {
    const next = [];
    for (const mapping of await applyMappings(rule, store).toArray()) {
      for (const conclusion of rule.rule.conclusion || []) {
        const quad = substituteQuad(conclusion, mapping);
        if (!store.has(quad) as unknown as boolean) {
          store.add(quad)
          next.push(quad);
        }
      }
    }
    if (next.length > 0) {
      return { rule, quads: next };
    }
  }

  for (const rule of nodes) {
    const res = await runRule(rule);
    if (res)
      nexts.push(res)
  }
  

  let n;
  while ((n = nexts.pop()) !== undefined) {
    const { rule, quads } = n;
    for (const r of rule.next) {
      for (const quad of quads) {
        const s = maybeSubstitute(r, quad);
        if (s) {
          const run = await runRule(s);
          if (run)
            nexts.push(run)
        }
      }
    }
  }
  return;
}

function nullifyVariables(term: RDF.Term) {
  return !term || term.termType === 'Variable' ? undefined : term;
}

export function substituteQuad(term: RDF.Quad, mapping: Mapping): RDF.Quad {
  // TODO: Fix the as any required to meed the Algebra.Pattern requirement
  // Should be able to do this once https://github.com/comunica/comunica/issues/999 is resolved.
  return mapTerms(term, elem => elem.termType === 'Variable' && elem.value in mapping ? mapping[elem.value] : elem) as any;
}

function applyMappings(rule: IRuleNode, store: RDF.DatasetCore): AsyncIterator<Mapping> {

  return rule.rule.premise.reduce<AsyncIterator<Mapping>>((m: AsyncIterator<Mapping>, premise) => {
    const r = m.map(mp => {
      const cause = substituteQuad(premise, mp)
      return wrap<RDF.Quad>(store.match(
        nullifyVariables(cause.subject) as any,
        nullifyVariables(cause.predicate) as any,
        nullifyVariables(cause.object) as any,
        nullifyVariables(cause.graph) as any,
      ) as any).map(quad => {
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
        return localMapping && Object.assign(localMapping, mp);
      });
    });

    return new UnionIterator(r, { autoStart: false });
    
    // const mappings: Mapping[] = [];
    // for (const mp of m) {
    //   const cause = substituteQuad(premise, mp);
      // const match = wrap<RDF.Quad>(store.match(
      //   nullifyVariables(cause.subject) as any,
      //   nullifyVariables(cause.predicate) as any,
      //   nullifyVariables(cause.object) as any,
      //   nullifyVariables(cause.graph) as any,
      // ) as any).map(quad => {
      //   let localMapping: Mapping | null = {};

      //   forEachTerms(cause, (term, key) => {
      //     if (term.termType === 'Variable' && localMapping) {
      //       if (term.value in localMapping && !localMapping[term.value].equals((quad as any)[key])) {
      //         localMapping = null;
      //       } else {
      //         localMapping[term.value] = (quad as any)[key];
      //       }
      //     }
      //   });
      //   return localMapping !== null && Object.assign(localMapping, mp);
      // }).filter(localMapping => localMapping !== false);
    //   // let quad: RDF.Quad | null;
    //   // while ((quad = match.read()) !== null) {
    //     // let localMapping: Mapping | null = {};

    //     //   forEachTerms(cause, (term, key) => {
    //     //     if (term.termType === 'Variable' && localMapping) {
    //     //       if (term.value in localMapping && !localMapping[term.value].equals((quad as any)[key])) {
    //     //         localMapping = null;
    //     //       } else {
    //     //         localMapping[term.value] = (quad as any)[key];
    //     //       }
    //     //     }
    //     //   });
    //     //   if (localMapping)
    //     //     mappings.push(Object.assign(localMapping, mp));
    //   // }
    //   mappings = mappings.concat(...await match.toArray())
    // }
    // return mappings;
  }, single<Mapping>({}))


  // return rule.rule.premise.reduce<Mapping[]>((m: Mapping[], premise) => {
  //   const mappings: Mapping[] = [];
  //   for (const mp of m) {
  //     const cause = substituteQuad(premise, mp);
  //     const match = wrap<RDF.Quad>(store.match(
  //       nullifyVariables(cause.subject) as any,
  //       nullifyVariables(cause.predicate) as any,
  //       nullifyVariables(cause.object) as any,
  //       nullifyVariables(cause.graph) as any,
  //     ) as any).map(quad => {
  //       let localMapping: Mapping | null = {};

  //       forEachTerms(cause, (term, key) => {
  //         if (term.termType === 'Variable' && localMapping) {
  //           if (term.value in localMapping && !localMapping[term.value].equals((quad as any)[key])) {
  //             localMapping = null;
  //           } else {
  //             localMapping[term.value] = (quad as any)[key];
  //           }
  //         }
  //       });
  //       return localMapping !== null && Object.assign(localMapping, mp);
  //     }).filter(localMapping => localMapping !== false);
  //     // let quad: RDF.Quad | null;
  //     // while ((quad = match.read()) !== null) {
  //       // let localMapping: Mapping | null = {};

  //       //   forEachTerms(cause, (term, key) => {
  //       //     if (term.termType === 'Variable' && localMapping) {
  //       //       if (term.value in localMapping && !localMapping[term.value].equals((quad as any)[key])) {
  //       //         localMapping = null;
  //       //       } else {
  //       //         localMapping[term.value] = (quad as any)[key];
  //       //       }
  //       //     }
  //       //   });
  //       //   if (localMapping)
  //       //     mappings.push(Object.assign(localMapping, mp));
  //     // }
  //     mappings = mappings.concat(...await match.toArray())
  //   }
  //   return mappings;
  // }, [{}])
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
