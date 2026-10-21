from pathlib import Path
import os,subprocess,sys
p=Path('/tmp/neistra-110-zoom-check');assert not p.exists();p.mkdir()
e={**os.environ,'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','PLAYWRIGHT_BROWSERS_PATH':'.playwright','MOLWEAVE_E2E_API_PORT':'16210','MOLWEAVE_E2E_WORKER_PORT':'16211','MOLWEAVE_E2E_WEB_PORT':'16273','MOLWEAVE_E2E_DATA_DIR':str(p/'data'),'PLAYWRIGHT_JSON_OUTPUT_NAME':str(p/'browser.json'),'MOLWEAVE_AMBERTOOLS_PREFIX':'/datadisk/dev/.neistra-tools/ambertools-24.8'}
c=['corepack','pnpm','exec','playwright','test','tests/e2e/quick-minimization.spec.ts','--grep','preserves quick settings through actual','--project=chromium','--repeat-each=3','--reporter=list,json']
with (p/'browser.log').open('wb') as f:r=subprocess.run(c,env=e,stdout=f,stderr=subprocess.STDOUT)
print((p/'browser.log').read_text()[-9000:]);sys.exit(r.returncode)
