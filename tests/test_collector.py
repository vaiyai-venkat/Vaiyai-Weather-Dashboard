import unittest
import datetime as dt
import collector

class NormalizationTests(unittest.TestCase):
    def test_missing_is_not_zero_and_metric_units_preserved(self):
        r = collector.daily_record({'obsTimeLocal': '2026-10-24 23:59:00', 'metric': {'tempHigh': 34.2, 'precipTotal': 0}}, 'Asia/Kolkata')
        self.assertEqual(r['date'], '2026-10-24')
        self.assertEqual(r['temp_max'], 34.2)
        self.assertEqual(r['rain_total'], 0)
        self.assertIsNone(r['humidity_min'])
        self.assertIsNone(r['solar_max'])
        self.assertNotIn('solar_min', r)

    def test_station_and_qc_filter(self):
        self.assertTrue(collector.valid_record({'stationID': 'IPAPAN3', 'qcStatus': -1}, 'IPAPAN3'))
        self.assertTrue(collector.valid_record({'stationID': 'IPAPAN3', 'qcStatus': 1}, 'IPAPAN3'))
        self.assertTrue(collector.valid_record({'stationID': 'IPAPAN3'}, 'IPAPAN3'))
        self.assertFalse(collector.valid_record({'stationID': 'IPAPAN3', 'qcStatus': 0}, 'IPAPAN3'))
        self.assertFalse(collector.valid_record({'stationID': 'OTHER'}, 'IPAPAN3'))

    def test_epoch_date_uses_ist(self):
        self.assertEqual(collector.local_date({'epoch': int(dt.datetime(2026, 10, 23, 20, tzinfo=dt.timezone.utc).timestamp())}, 'Asia/Kolkata'), '2026-10-24')

    def test_null_and_nonfinite(self):
        for value in [None, '', 'NaN', float('inf'), True]:
            self.assertIsNone(collector.number(value))
        self.assertEqual(collector.number(0), 0)
        self.assertIsNone(collector.direction(-9999))
        self.assertEqual(collector.direction(360), 0)

    def test_pressure_bounds_are_preserved_for_interval_charts(self):
        row = collector.point_record({'obsTimeUtc':'2026-10-24T06:00:00Z','obsTimeLocal':'2026-10-24 11:30:00','metric':{'pressureMin':1005.2,'pressureMax':1010.8}},'Asia/Kolkata')
        self.assertEqual(row['pressure_min'],1005.2)
        self.assertEqual(row['pressure_max'],1010.8)
        self.assertTrue(collector.has_readings({'pressure_min':1005.2}))

    def test_current_casing_and_interval_casing(self):
        current = collector.point_record({'epoch': 1792778400, 'humidity': 90, 'winddir': 360, 'solarRadiation': 0, 'metric': {'windSpeed': 2.5, 'windGust': 4.7, 'temp': 27}}, 'Asia/Kolkata', True)
        interval = collector.point_record({'epoch': 1792778400, 'humidityAvg': 90, 'winddirAvg': 10, 'solarRadiationHigh': 240, 'metric': {'windspeedAvg': 3.1, 'windgustHigh': 8.2, 'tempAvg': 28}}, 'Asia/Kolkata')
        self.assertEqual(current['wind'], 2.5)
        self.assertEqual(current['solar'], 0)
        self.assertEqual(interval['gust'], 8.2)
        self.assertEqual(interval['solar'], 240)

if __name__ == '__main__': unittest.main()
