// ═══════════════════════════════════════════════════════════
// BOKA — Synonyms map (PL + tech terms)
// Port z agentmemory/src/state/synonyms.ts + polskie dodatki
// ═══════════════════════════════════════════════════════════

import { stem } from './stemmer';

const SYNONYM_GROUPS: string[][] = [
  // ── Tech (z oryginału) ──
  ['auth', 'authentication', 'authn', 'authenticating', 'logowanie', 'logować', 'uwierzytelnianie'],
  ['authz', 'authorization', 'authorizing', 'autoryzacja', 'uprawnienia'],
  ['db', 'database', 'datastore', 'baza', 'baza-danych'],
  ['perf', 'performance', 'latency', 'throughput', 'slow', 'bottleneck', 'wydajność', 'opóźnienie'],
  ['optim', 'optimization', 'optimizing', 'optimise', 'optymalizacja'],
  ['k8s', 'kubernetes', 'kube'],
  ['config', 'configuration', 'configuring', 'setup', 'konfiguracja'],
  ['deps', 'dependencies', 'dependency', 'zależności'],
  ['env', 'environment', 'środowisko'],
  ['fn', 'function', 'funkcja'],
  ['impl', 'implementation', 'implementing', 'implementacja'],
  ['msg', 'message', 'messaging', 'wiadomość', 'komunikat'],
  ['repo', 'repository', 'repozytorium'],
  ['req', 'request', 'żądanie'],
  ['res', 'response', 'odpowiedź'],
  ['ts', 'typescript'],
  ['js', 'javascript'],
  ['pg', 'postgres', 'postgresql'],
  ['err', 'error', 'errors', 'błąd', 'błędy'],
  ['api', 'endpoint', 'endpoints', 'punkt-końcowy'],
  ['ci', 'continuous-integration'],
  ['cd', 'continuous-deployment'],
  ['test', 'testing', 'tests', 'testy', 'testowanie'],
  ['doc', 'documentation', 'docs', 'dokumentacja'],
  ['infra', 'infrastructure', 'infrastruktura'],
  ['deploy', 'deployment', 'deploying', 'wdrożenie'],
  ['cache', 'caching', 'cached', 'pamięć-podręczna', 'kejsz'],
  ['log', 'logging', 'logs', 'logi'],
  ['monitor', 'monitoring', 'monitorowanie'],
  ['observe', 'observability', 'obserwowalność'],
  ['sec', 'security', 'secure', 'bezpieczeństwo'],
  ['validate', 'validation', 'validating', 'walidacja'],
  ['migrate', 'migration', 'migrations', 'migracja'],
  ['debug', 'debugging', 'debugowanie'],
  ['container', 'containerization', 'docker', 'kontener'],
  ['crash', 'crashloop', 'crashloopbackoff', 'awaria'],
  ['webhook', 'webhooks', 'callback'],
  ['middleware', 'mw'],
  ['paginate', 'pagination', 'paginacja'],
  ['serialize', 'serialization', 'serializacja'],
  ['encrypt', 'encryption', 'szyfrowanie'],
  ['hash', 'hashing', 'haszowanie'],

  // ── Polskie (dodatki BOKA) ──
  ['dom', 'rodzina', 'mieszkanie', 'house', 'home'],
  ['boka', 'asystent', 'assistant', 'ai'],
  ['agent', 'agents', 'agenci', 'multi-agent'],
  ['memory', 'pamięć', 'wspomnienia', 'wspomnienie'],
  ['czat', 'chat', 'rozmowa', 'konwersacja'],
  ['voice', 'głos', 'mowa', 'speech'],
  ['prompt', 'promt', 'pytanie', 'zapytanie'],
  ['model', 'models', 'modele', 'llm'],
  ['tool', 'narzędzie', 'narzędzia'],
  ['file', 'plik', 'pliki'],
  ['task', 'zadanie', 'taski'],
  ['user', 'użytkownik', 'użytkownicy'],
  ['child', 'dziecko', 'dzieci'],
  ['parent', 'rodzic', 'rodzice'],
  ['partner', 'partnerka', 'mąż', 'żona'],
  ['session', 'sesja', 'sesje'],
  ['prompt', 'zapytanie'],
  ['answer', 'odpowiedź', 'odp'],
  ['question', 'pytanie'],
  ['token', 'tokens', 'tokeny'],
  ['cost', 'koszt', 'cena'],
  ['stream', 'streaming', 'strumień'],
  ['judge', 'sędzia', 'ocena'],
  ['strategy', 'strateg', 'strategia'],
  ['critic', 'krytyk', 'krytyka'],
  ['executor', 'wykonawca', 'executor'],
];

const synonymMap = new Map<string, Set<string>>();

for (const group of SYNONYM_GROUPS) {
  const stemmed = group.map(t => stem(t.toLowerCase()));
  for (const s of stemmed) {
    if (!synonymMap.has(s)) synonymMap.set(s, new Set());
    for (const other of stemmed) {
      if (other !== s) synonymMap.get(s)!.add(other);
    }
  }
}

/** Zwróć synonimy (już stemmowane) dla danego stemmowanego terminu. */
export function getSynonyms(stemmedTerm: string): string[] {
  const syns = synonymMap.get(stemmedTerm);
  return syns ? [...syns] : [];
}
