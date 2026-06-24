import { runAgingCheck } from './src/lib/waos/knowledge-aging';
runAgingCheck().then(r => console.log(JSON.stringify(r))).catch(e => console.error('Error:', e));