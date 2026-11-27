"""Read-only native/companion audit; writes only this assigned report directory."""
from pathlib import Path
import base64
import collections
import datetime
import gzip
import hashlib
import json
import math
import statistics
import subprocess

ROOT = Path('/datadisk/dev/neistra-worktrees/issue-160-merged-qualification2')
OUT = ROOT/'.issue-11-evidence/issue160-master2-native-independent-audit1'
ASSETS = ROOT/'docs/assets/ligand-profiles'
COMMIT = 'c6f3e283ef3f6bed4a00c6dfe3fef36bf5bc3f82'
load = lambda p: json.loads(p.read_bytes())
sha = lambda b: hashlib.sha256(b).hexdigest()
identity = lambda p: {'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip() == COMMIT
gate = load(ASSETS/'c4-master2-gate.json')
assert gate['commit'] == COMMIT and gate['complete'] and len(gate['steps']) == 43
assert all(s['exit_code'] == 0 for s in gate['steps'])
browser_path = ASSETS/'c4-master2-browser.json'
if not browser_path.exists():
    browser_path = ROOT/'.issue-11-evidence/issue160-c4-master2-run1/original-browser-before-summary.json'
browser_blob = browser_path.read_bytes()
browser = json.loads(browser_blob)
assert not browser.get('errors') and browser['stats']['unexpected'] == browser['stats']['flaky'] == 0
report_paths = sorted((ROOT/'.issue-11-evidence/issue160-profile-performance').glob('*/profile-performance-v1.json')) + sorted((ROOT/'.issue-11-evidence/issue159-performance').glob('*/native-*-performance.json'))
assert len(report_paths) == 10
by_hash = {sha(p.read_bytes()):p for p in report_paths}
assert len(by_hash) == 10
bindings = []
annotations = collections.defaultdict(list)
worker_attachments = []
def walk(suite):
    for spec in suite.get('specs',[]):
        for test in spec['tests']:
            for annotation in test.get('annotations',[]):
                if annotation['type'] == 'performance':
                    item = json.loads(annotation['description'])
                    assert math.isfinite(item['actual']) and item['actual'] >= 0
                    within = item['actual'] <= item['limit'] if item['inclusive'] else item['actual'] < item['limit']
                    assert within == item['withinTarget']
                    annotations[spec['file']].append({'project':test['projectName'],'title':spec['title'],**item})
            if spec['file'] not in ('ligand-profiles-performance.spec.ts','ligand-properties-performance.spec.ts'):
                continue
            assert len(test['results']) == 1 and test['results'][0]['status'] == 'passed'
            found = []
            for attachment in test['results'][0].get('attachments',[]):
                if 'body' in attachment:
                    body = base64.b64decode(attachment['body'],validate=True)
                    path = by_hash[sha(body)]
                    assert path.read_bytes() == body
                    found.append(path)
                    bindings.append({'test_file':spec['file'],'test_title':spec['title'],'project':test['projectName'],'attachment':attachment['name'],'external_report':str(path),'identity':identity(path)})
                elif attachment['name'] == 'descriptor-worker-observation':
                    worker_attachments.append(Path(attachment['path']))
            assert len(found) == 1
    for child in suite.get('suites',[]):
        walk(child)
for suite in browser['suites']:
    walk(suite)
assert len(bindings) == 10 and {b['external_report'] for b in bindings} == {str(p) for p in report_paths}
cases = [p.parent for p in report_paths]
assert len(set(cases)) == 10
snapshot = load(ROOT/'.issue-11-evidence/issue160-c4-master2-run1/pre-launch-external-case-directories.json')
assert snapshot['candidate'] == COMMIT and all(not rows for rows in snapshot['namespaces'].values())
primary_namespace = ROOT/'.issue-11-evidence/issue161-primary-performance'
assert not primary_namespace.exists() or not list(primary_namespace.iterdir())
for namespace in ('issue160-profile-performance','issue159-performance'):
    assert {p for p in (ROOT/'.issue-11-evidence'/namespace).iterdir()} == {p for p in cases if p.parent.name == namespace}
observations = {}
source_maps = set()
for case in cases:
    observation_path = case/'worker-observation.json'
    obs = load(observation_path)
    assert obs['complete'] and obs['sources_unchanged'] and obs['sources_before'] == obs['sources_after']
    assert all(gate['source_before'].get(p) == h for p,h in obs['sources_before'].items())
    source_maps.add(sha(json.dumps(obs['sources_before'],sort_keys=True).encode()))
    order = obs['work_order']
    assert order['complete'] and order['header']['data_dir'] == '/tmp/neistra160-c4-master2/e2e'
    assert order['header']['database'] == '/tmp/neistra160-c4-master2/e2e/neistra.db'
    trace = Path(order['observed_records'])
    assert trace == case/'work-order-observed.jsonl' and sha(trace.read_bytes()) == order['observed_sha256']
    events = [json.loads(line) for line in trace.read_bytes().splitlines()]
    assert events[0]['event'] == 'header' and events[0]['format_version'] == 1
    assert len(events)-1 == order['records']
    for index,event in enumerate(events[1:]):
        assert event['record'] == order['start_record']+index+1 and event['event'] != 'turn_error'
        assert int(event['monotonic_ns']) >= 0
    assert events[-1]['record'] == order['last_record']
    assert obs['max_running_property_jobs'] <= 1
    retained = obs['retained']
    assert retained['content_bytes'] <= 16*1024*1024 and retained['ligand_property_content'] <= 2048
    assert retained['ligand_property_proofs'] <= 4096 and retained['ligand_property_executions'] <= 33
    observations[case] = obs
    if (case/'observer-execution.json').exists():
        execution = load(case/'observer-execution.json')
        assert execution['completion'] == {'code':0,'signal':None}
for path in worker_attachments:
    assert path.is_relative_to(ASSETS/'c4-master2-native')
    matched = [case for case in cases if (case/'worker-observation.json').read_bytes() == path.read_bytes()]
    assert len(matched) == 1
assert len(worker_attachments) == 8 and len(source_maps) == 1
observed_source_map = next(iter(observations.values()))['sources_before']
for name,digest in observed_source_map.items():
    assert sha((ROOT/name).read_bytes()) == digest == gate['source_before'][name]
profile_results = {}
property_results = {}
for path in report_paths:
    value = load(path)
    case = path.parent
    if path.name == 'profile-performance-v1.json':
        assert value['candidate'] == COMMIT and value['sources_unchanged'] and not value['failures']
        assert value['store']['data'] == '/tmp/neistra160-c4-master2/e2e'
        for companion in value['companions']:
            assert sha((case/companion['path']).read_bytes()) == companion['sha256']
        sm = load(case/'source-map.json')
        assert sm['initial_candidate'] == sm['final_candidate'] == COMMIT and sm['initial'] == sm['final']
        assert all(gate['source_before'].get(p) == h for p,h in sm['initial'].items())
        assert len(value['records']) == 32
        cold = [r for r in value['records'] if r['phase'] == 'first-selection']
        warm = [r for r in value['records'] if r['phase'] == 'warm-switch']
        assert len(cold) == 5 and len(warm) == 20
        assert sorted(r['specimen']['heavy_atoms'] for r in cold) == [10,26,46,66,86]
        assert all(r['cache_classification'] == 'numerical-cold-missing' for r in cold)
        assert all(not r['new_jobs'] and all(r['request_delta'][k] == 0 for k in ('allocations','demands','metadata')) for r in warm)
        for records,key in ((cold,'cold'),(warm,'warm')):
            times = sorted(r['durations']['current_criteria_ms'] for r in records)
            expected = value['summary'][key]
            assert expected['n'] == len(times) and expected['median'] == statistics.median(times)
            assert expected['max'] == max(times) and expected['p95_nearest_rank'] == times[math.ceil(len(times)*.95)-1]
            assert expected['misses'] == sum(t > expected['target'] for t in times)
        cleanup = value['cleanup']
        assert cleanup['preferences_restored'] and cleanup['observer_closed'] and cleanup['worker_reaped']
        assert cleanup['consumer_state']['owned_live_count'] == 0
        assert sha((Path(cleanup['consumer_state']['directory'])/'result.json').read_bytes()) == cleanup['consumer_state']['result_sha256']
        profile_results[value['environment']['project']] = {'environment':value['environment'],'cold':value['summary']['cold'],'warm':value['summary']['warm'],'warm_new_jobs_and_allocations':0,'phases':[{k:r[k] for k in ('phase','durations','automatic_current_ms','request_delta','new_jobs','attempts','retry_durations','first_metadata_failure_ms','recovery_total_ms','injected_hold_ms','recovery_excluding_injected_hold_ms') if k in r} for r in value['records'] if r['phase'] not in ('first-selection','warm-switch')],'cleanup':{'preferences_restored':True,'owned_live_consumers':0,'observer_closed':True,'worker_reaped':True},'measurement_gaps':value['measurement_gaps']}
    else:
        key = value['profile']+':'+path.name+(':'+value['kind'] if 'kind' in value else '')
        summary = {k:value[k] for k in ('scope','kind','profile','coldStarts','coldEdits','coldEditVisibleIncludingPresentation','warmUndo','matchingCacheProjection','readyCount','qualifiedDistinctInputHashes','failures','hardWorkOrderStatus') if k in value}
        summary['targets'] = value['targets']
        if path.name == 'native-edit-performance.json':
            assert Path(value['workerObservation']) == case
            assert len(value['records']) == 25 and sum(r['kind']=='paired-edit' for r in value['records']) == 20
            assert all(not r['warmNewJobs'] for r in value['records'] if r['kind']=='paired-edit')
            summary['paired_heavy_atoms'] = [r['heavyAtoms'] for r in value['records'] if r['kind']=='paired-edit']
        if path.name == 'native-bulk-performance.json':
            assert value['readyCount'] == 1000 and not value['failures'] and value['hardWorkOrderStatus'] == 'passed'
            assert value['qualifiedDistinctInputHashes'] == (1000 if value['kind']=='distinct' else 1)
            proof = value['hardWorkOrder']
            assert proof['ordinary']['productiveDerivedTurnsBeforeClaim'] <= 4
            assert len(proof['active']['productiveBulkFairnessTurnsBeforeAdmission']) <= 1
            assert proof['active']['source'] == value['changedSource'] and proof['active']['inputHash'] == value['changedInputHash']
            assert proof['active']['observedRecord'] <= proof['active']['admissionRecord'] <= proof['active']['publicationRecord']
            assert sha(Path(proof['trace']['path']).read_bytes()) == proof['trace']['sha256']
            if value['kind']=='distinct':assert proof['active']['priorityOverlapExercised'] and proof['active']['actualPostAcceptanceBulkBindings'] > 0
            summary['active'] = {k:value['active'].get(k) for k in ('networkCurrentMs','currentMs','retirementMs','retirementQualification')}
            summary['hard_order'] = {'ordinary_productive_turns':proof['ordinary']['productiveDerivedTurnsBeforeClaim'],'active_fairness_turns':len(proof['active']['productiveBulkFairnessTurnsBeforeAdmission']),'actual_post_acceptance_bulk_bindings':proof['active']['actualPostAcceptanceBulkBindings'],'priority_overlap_exercised':proof['active']['priorityOverlapExercised']}
            summary['active_heavy_atoms'] = value['editablePreflight']['result']['heavy_atoms']
        property_results[key] = summary
    expected = annotations['ligand-profiles-performance.spec.ts' if path.name=='profile-performance-v1.json' else 'ligand-properties-performance.spec.ts']
    project = value['environment']['project'] if path.name=='profile-performance-v1.json' else value['profile']
    for target in value['targets']:
        assert any(all(a[k] == target[k] for k in target) for a in expected if a['project']==project)
        assert target['enforced'] is False

inventory = {}
for case in cases:
    for path in sorted(case.rglob('*')):
        assert not path.is_symlink()
        if path.is_file():inventory[str(path.relative_to(ROOT))] = identity(path)
for path in worker_attachments:inventory[str(path.relative_to(ROOT))] = identity(path)
for name in ('tests/e2e/ligand-profiles-performance.spec.ts','tests/e2e/ligand-properties-performance.spec.ts','tests/e2e/support/performance.ts','docs/PERFORMANCE.md','docs/plans/issue-160-physicochemical-profiles.md'):
    inventory[name] = identity(ROOT/name)
    if name in gate['source_before']:assert inventory[name]['sha256'] == gate['source_before'][name]
inventory_blob = (json.dumps(inventory,indent=2,sort_keys=True)+'\n').encode()
(OUT/'input-body-inventory.json').write_bytes(inventory_blob)
target_counts = {name:{'annotations':len(rows),'misses':sum(not a['withinTarget'] for a in rows)} for name,rows in annotations.items()}
misses = {name:[a for a in rows if not a['withinTarget']] for name,rows in annotations.items() if any(not a['withinTarget'] for a in rows)}
assert target_counts['ligand-profiles-performance.spec.ts']['misses'] == 30
assert target_counts['ligand-properties-performance.spec.ts']['misses'] == 119
assert target_counts['performance-policy.spec.ts']['misses'] == 4
assert target_counts['minimization-performance.spec.ts']['misses'] == 1
assert sum(row['misses'] for row in target_counts.values()) == 154
sampled_memory = {str(case.relative_to(ROOT)):{'max_individual_child_rss_bytes':max(obs.get('peak_child_rss_bytes',{}).values(),default=0),'worker_parent_sampled_rss_bytes':obs.get('peak_worker_parent_rss_bytes'),'max_running_property_jobs':obs['max_running_property_jobs'],'retained':obs['retained']} for case,obs in observations.items()}
report = {'schema':'master2-native-companion-independent-audit-v1','candidate':COMMIT,'reviewed_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Bounded read-only audit of native performance evidence and exact external-case bindings; not final seven-role application approval','verdict':'PASS','consequential_findings':[],'browser_original_body':{'path_used':str(browser_path),'bytes':len(browser_blob),'sha256':sha(browser_blob)},'exact_native_external_bindings':bindings,'exact_cases':sorted(str(p) for p in cases),'complete_external_case_count':10,'worker_source_map_count':len(next(iter(observations.values()))['sources_before']),'all_worker_source_maps_identical_and_bound_to_gate':True,'native_worker_attachments_byte_exact':8,'profile':profile_results,'inherited_property':property_results,'all_browser_target_counts':target_counts,'all_browser_target_misses':misses,'all_workflow_misses_excluding_policy_examples':150,'profile_and_property_workflow_misses':149,'deliberate_policy_misses_separate':4,'sampled_memory':sampled_memory,'input_inventory':{'path':str(OUT/'input-body-inventory.json'),'files':len(inventory),'bytes':len(inventory_blob),'sha256':sha(inventory_blob)},'checks':['All ten native inline report bodies decode to byte-exact unique external originals','Both project profiles execute all ten distinct cases without failure/retry','Eight native worker files equal the corresponding complete case observations','All case observations and contiguous trace bodies bind the exact owned store and frozen source map','All profile companions rehashed, actual five cold and twenty warm distributions independently recomputed','All browser performance annotations parsed with target predicate independently recalculated','Actual bulk source/generation trace bindings, stated hard bounds, READY counts, profile cleanup and consumer retirement inspected','Full ten-case file inventory rehashed without deleting or relocating originals'],'limitations':['No new optimization, campaign, SQL, service, Git or publication action performed','Timing targets remain portable and unenforced under D-148; 30 profile +119 property +1 minimization target misses require disclosure','One 18k-atom minimization discard observation is501.39999997615814ms against strict-less-than500ms target; this is a portable timing miss','Four deliberate policy misses are separate from150actualworkflow misses','Hidden retirement and hidden visible-current observations remain null/unavailable, never measured zero','Mobile Chromium is existing emulation, not physical-device qualification','Sampled individual child and parent RSS peaks are not simultaneous or aggregate peak memory; browser/GPU peak unavailable','Observer job sets can include earlier shared-store jobs; ownership is established by source/project and native report bindings, not all observed jobs','Recorded hard-order proof and contiguous trace/hash/source bindings inspected; this audit does not rerun the original TypeScript assertion implementation','No speedup, strict-host, universal-capacity or final merged/release/readiness claim']}
report['current_observed_source_bodies_independently_rehashed'] = len(observed_source_map)
report['profile_require_cold_flags'] = {load(p)['environment']['project']:load(p)['require_cold'] for p in report_paths if p.name=='profile-performance-v1.json'}
report['cold_classification_note'] = 'Full campaign did not set REQUIRE_COLD; all five actual before-selection missing-required-coverage classifications per project nevertheless independently support the recorded numerical-cold distributions.'
canonical_browser = ASSETS/'c4-master2-browser.json.gz'
if canonical_browser.exists():
    assert gzip.decompress(canonical_browser.read_bytes()) == browser_blob
    report['canonical_compressed_browser_matches_original_body'] = True
for name,expected in inventory.items():
    assert identity(ROOT/name) == expected
report['all_757_indexed_input_bodies_rehashed_unchanged_after_analysis'] = True
(OUT/'report.json').write_text(json.dumps(report,indent=2,sort_keys=True)+'\n')
print(json.dumps({'verdict':report['verdict'],'exact_cases':len(cases),'inventory_files':len(inventory),'profile_misses':30,'property_misses':119,'other_workflow_misses':1,'policy_examples_separate':4,'report':str(OUT/'report.json')}))
