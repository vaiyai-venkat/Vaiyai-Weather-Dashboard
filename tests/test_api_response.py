import io
import json
from contextlib import redirect_stdout
from unittest import TestCase
from unittest.mock import patch
import collector

class APIResponseTests(TestCase):
    def response(self, rows, status=200):
        response = io.BytesIO(json.dumps({'observations': rows}).encode())
        response.status = status
        return response

    def test_unchecked_api_records_are_kept_and_diagnostics_are_safe(self):
        rows=[{'stationID':'IPAPAN3','qcStatus':-1,'metric':{'temp':27}},
              {'stationID':'IPAPAN3','qcStatus':1},
              {'stationID':'IPAPAN3','qcStatus':0},
              {'stationID':'OTHER','qcStatus':1}]
        client=collector.Client('DO_NOT_LOG_THIS_API_KEY','IPAPAN3',pause=0)
        log=io.StringIO()
        with patch.object(collector,'urlopen',return_value=self.response(rows)),redirect_stdout(log):
            accepted=client.get('observations/current')
        self.assertEqual(len(accepted),2)
        self.assertEqual(accepted[0]['qcStatus'],-1)
        self.assertEqual(client.diagnostics[0]['received'],4)
        self.assertEqual(client.diagnostics[0]['accepted'],2)
        self.assertNotIn('DO_NOT_LOG_THIS_API_KEY',log.getvalue())
        self.assertNotIn('apiKey=',log.getvalue())

    def test_empty_response_is_distinct_from_filtering(self):
        client=collector.Client('TEST','IPAPAN3',pause=0)
        with patch.object(collector,'urlopen',return_value=self.response([])):
            self.assertEqual(client.get('history/daily','2026-10-24'),[])
        self.assertEqual(client.diagnostics[0]['received'],0)
        self.assertEqual(client.diagnostics[0]['qc_counts'],{})

    def test_http_204_is_recorded(self):
        client=collector.Client('TEST','IPAPAN3',pause=0)
        with patch.object(collector,'urlopen',return_value=self.response([],204)):
            self.assertEqual(client.get('observations/current'),[])
        self.assertEqual(client.diagnostics[0]['http_status'],204)
