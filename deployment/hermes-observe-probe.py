"""Operator-only RF-002C probe. Reads protected env locally; never prints credentials.
Run from the existing Docker network with protected client.env read-only mounted.
Default is health/capability discovery. Explicit --execute-one admits one input-only run.
No automatic re-POST after an ambiguous response; retain ledger for reconciliation.
"""
import argparse
import json
import os
import pathlib
import time
import uuid
import urllib.request
import urllib.error
import urllib.parse


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--env-file', default='/run/rockfoundry/client.env')
    parser.add_argument('--ledger', required=True)
    parser.add_argument('--execute-one', action='store_true')
    parser.add_argument('--observe-verified', action='store_true')
    args = parser.parse_args()
    values = {}
    for line in pathlib.Path(args.env_file).read_text().splitlines():
        if line.strip() and not line.startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip().strip('\"\'')
    base = values['HERMES_RUNS_BASE_URL'].rstrip('/')
    secret = values['HERMES_API_KEY']
    model = values['HERMES_MODEL']
    if base != 'http://192.168.16.1:8643' or model != 'rockfoundry':
        raise RuntimeError('Unexpected endpoint/model; operator must reconcile configuration')

    def request(endpoint, body=None, identity=None):
        headers = {'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json'}
        if identity:
            headers['Idempotency-Key'] = identity
        req = urllib.request.Request(base + endpoint, data=json.dumps(body).encode() if body else None, headers=headers)
        # Do not redirect an authenticated request to another authority.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None
        with urllib.request.build_opener(NoRedirect).open(req, timeout=10) as response:
            data = response.read(1000001)
            if len(data) > 1000000:
                raise RuntimeError('Response exceeds safe bound')
            return json.loads(data)

    health = request('/health')
    capabilities = request('/v1/capabilities')
    features = capabilities.get('features', {})
    replay = features.get('runs_idempotency', {})
    if health.get('status') != 'ok' or capabilities.get('auth', {}).get('type') != 'bearer' or not capabilities.get('auth', {}).get('required'):
        raise RuntimeError('Health/auth contract incompatible')
    if not all(features.get(k) for k in ['run_submission', 'run_status']) or not replay.get('durable') or not replay.get('supported') or replay.get('retention_seconds', 0) < 86400:
        raise RuntimeError('Durable Runs contract incompatible')
    print(json.dumps({'health': 'ok', 'authenticated_capabilities': 'compatible', 'model_alias': model, 'live_submissions_this_invocation': 0}))
    ledger = pathlib.Path(args.ledger)
    if not args.execute_one:
        return
    if not args.observe_verified:
        raise RuntimeError('Verify runtime observe tool policy before execution; prompt restrictions are insufficient')
    ledger.parent.mkdir(parents=True, exist_ok=True)
    if ledger.exists():
        state = json.loads(ledger.read_text())
        if not state.get('run_id'):
            raise RuntimeError('Existing ambiguous intent: do not submit again; reconcile same Idempotency-Key externally')
    else:
        state = {'idempotency_key': str(uuid.uuid4()), 'status': 'SUBMISSION_INTENT', 'created_at': time.time()}
        # Atomic exclusive ledger creation prevents separate invocations from creating two runs.
        fd = os.open(ledger, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as file:
            json.dump(state, file)
        admitted = request('/v1/runs', {'model': model, 'input': 'Input-only read-only smoke test. Summarize this supplied sentence in one short Indonesian sentence: Rock Foundry owns work records and human acceptance; Hermes executes delegated tasks. Do not call tools, read files, modify files, execute commands or send messages.', 'instructions': 'This smoke is under the provisioned observe execution policy. Respond using only supplied input; no tools or external side effects.'}, state['idempotency_key'])
        state['run_id'] = admitted['run_id']
        state['status'] = admitted.get('status')
        ledger.write_text(json.dumps(state))
    for _ in range(90):
        result = request('/v1/runs/' + urllib.parse.quote(state['run_id'], safe=''))
        state['status'] = result.get('status')
        if state['status'] in ['completed', 'failed', 'cancelled', 'interrupted']:
            output = result.get('output', '')
            if secret in output:
                raise RuntimeError('Unsafe output suppressed')
            state.update({'output': output, 'runtime': result.get('runtime'), 'session_id': result.get('session_id')})
            ledger.write_text(json.dumps(state, ensure_ascii=False))
            print(json.dumps({'run_id': state['run_id'], 'status': state['status'], 'output': output, 'runtime': state.get('runtime'), 'idempotency_key_retained': True}, ensure_ascii=False))
            return
        time.sleep(2)
    ledger.write_text(json.dumps(state))
    raise RuntimeError('Polling horizon elapsed: resume polling this ledger, never create another run')


if __name__ == '__main__':
    try:
        main()
    except urllib.error.HTTPError as error:
        print(json.dumps({'probe_error': 'HTTP_FAILED', 'http_status': error.code}))
        raise SystemExit(1)
    except Exception as error:
        # Error type only: urllib exceptions can contain URLs or sensitive transport details.
        print(json.dumps({'probe_error': type(error).__name__, 'action': 'retain ledger and reconcile; do not create a second live run'}))
        raise SystemExit(1)
