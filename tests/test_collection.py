"""Exercise archive persistence with fake provider replies; never contact the API."""
import datetime as dt
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from unittest.mock import patch
import collector

class CollectionTests(TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = self.root / 'dist' / 'data'
        config = {'station_id':'IPAPAN3', 'station_name':'Vaiyaicheri', 'location':'India', 'latitude':10.86, 'longitude':79.19, 'timezone':'Asia/Kolkata', 'installation_date':None, 'initial_history_days':4, 'backfill_days_per_run':1}
        (self.root / 'config.json').write_text(json.dumps(config))
        self.today = dt.datetime.now(dt.timezone.utc).astimezone(collector.ZoneInfo('Asia/Kolkata')).date()
        self.calls = []

    def provider(self, endpoint, date=None):
        self.calls.append((endpoint,date))
        if endpoint == 'history/daily':
            return [{'stationID':'IPAPAN3','obsTimeLocal':date+' 23:59:00','metric':{'tempHigh':33, 'tempLow':24, 'tempAvg':28, 'precipTotal':8.4},'humidityAvg':77}]
        if endpoint == 'history/all':
            return [{'stationID':'IPAPAN3','obsTimeLocal':date+' 12:00:00','obsTimeUtc':date+'T06:30:00Z','metric':{'tempAvg':28,'precipTotal':8.4,'precipRate':2}}]
        return []

    def run_collection(self):
        with patch.object(collector, 'ROOT', self.root), patch.object(collector, 'DATA', self.data), patch.dict('os.environ', {'WU_API_KEY':'TEST_NOT_A_REAL_KEY','WU_INSTALLATION_DATE':''}), patch.object(collector.Client,'get',side_effect=self.provider):
            return collector.collect()

    def test_backfill_progress_and_rain_counter_not_added_twice(self):
        self.assertEqual(self.run_collection(),0)
        m=json.loads((self.data/'manifest.json').read_text())
        self.assertEqual(m['history_days'],3)
        self.assertEqual(m['backfill']['remaining_days'],1)
        month=json.loads(next((self.data/'history').glob('*.json')).read_text())
        self.assertTrue(all(r['rain_total']==8.4 for r in month))
        self.calls=[]
        self.assertEqual(self.run_collection(),0)
        m=json.loads((self.data/'manifest.json').read_text())
        self.assertEqual(m['history_days'],4)
        self.assertEqual(m['backfill']['remaining_days'],0)
        self.assertEqual(len([c for c in self.calls if c[0]=='history/daily']),3)
        self.assertEqual(m['intraday_dates'][-1],self.today.isoformat())

    def test_authorization_failure_retains_previous_archive(self):
        self.run_collection()
        before={p.name:p.read_bytes() for p in (self.data/'history').glob('*.json')}
        with patch.object(collector, 'ROOT', self.root), patch.object(collector, 'DATA', self.data), patch.dict('os.environ', {'WU_API_KEY':'TEST_NOT_A_REAL_KEY','WU_INSTALLATION_DATE':''}), patch.object(collector.Client,'get',side_effect=collector.APIError('API authorization failed (HTTP 401).')):
            self.assertEqual(collector.collect(),1)
        after={p.name:p.read_bytes() for p in (self.data/'history').glob('*.json')}
        self.assertEqual(before,after)
        self.assertEqual(json.loads((self.data/'manifest.json').read_text())['status']['state'],'error')

    def test_old_checked_dates_are_retried_after_qc_fix(self):
        self.data.mkdir(parents=True)
        dates=[(self.today-dt.timedelta(days=i)).isoformat() for i in range(4)]
        (self.data/'collector-state.json').write_text(json.dumps({'checked_dates':dates}))
        self.assertEqual(self.run_collection(),0)
        state=json.loads((self.data/'collector-state.json').read_text())
        manifest=json.loads((self.data/'manifest.json').read_text())
        self.assertEqual(state['qc_filter_version'],2)
        self.assertEqual(manifest['history_days'],3)
        self.assertEqual(manifest['backfill']['remaining_days'],1)

    def test_missing_key_is_clear_and_not_a_job_failure(self):
        with patch.object(collector, 'ROOT', self.root), patch.object(collector, 'DATA', self.data), patch.dict('os.environ', {'WU_API_KEY':'','WU_INSTALLATION_DATE':''}):
            self.assertEqual(collector.collect(),0)
        self.assertEqual(json.loads((self.data/'manifest.json').read_text())['status']['state'],'unconfigured')
