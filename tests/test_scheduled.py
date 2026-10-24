import datetime as dt
import json
from unittest.mock import patch
from unittest import TestCase
import test_collection as fixtures
import collector

class ScheduledCollectionTests(TestCase):
    setUp = fixtures.CollectionTests.setUp
    provider = fixtures.CollectionTests.provider
    run_collection = fixtures.CollectionTests.run_collection
    def test_scheduled_tick_only_refreshes_today_when_history_is_recent(self):
        self.run_collection()
        self.calls=[]
        with patch.object(collector,'ROOT',self.root),patch.object(collector,'DATA',self.data),patch.dict('os.environ',{'WU_API_KEY':'TEST','WU_INSTALLATION_DATE':''}),patch.object(collector.Client,'get',side_effect=self.provider):
            self.assertEqual(collector.collect(scheduled=True,recent_week=True),0)
        self.assertEqual([call[0] for call in self.calls],['observations/current','history/all','history/daily'])
        self.assertEqual(self.calls[-1][1],self.today.isoformat())
        manifest=json.loads((self.data/'manifest.json').read_text())
        self.assertEqual(manifest['refresh_target_minutes'],5)
        self.assertIn('collection_finished_at',manifest)

    def test_first_recent_week_batch_gets_seven_interval_archives(self):
        config=json.loads((self.root/'config.json').read_text());config['initial_history_days']=30;(self.root/'config.json').write_text(json.dumps(config))
        with patch.object(collector,'ROOT',self.root),patch.object(collector,'DATA',self.data),patch.dict('os.environ',{'WU_API_KEY':'TEST','WU_INSTALLATION_DATE':''}),patch.object(collector.Client,'get',side_effect=self.provider):
            self.assertEqual(collector.collect(max_backfill=0,scheduled=True,recent_week=True),0)
        manifest=json.loads((self.data/'manifest.json').read_text());expected={(self.today-dt.timedelta(days=i)).isoformat() for i in range(7)}
        self.assertTrue(expected.issubset(set(manifest['intraday_dates'])))
        self.assertEqual(manifest['history_days'],7)
        state=json.loads((self.data/'collector-state.json').read_text());self.assertEqual(state['intraday_schema_version'],2)
