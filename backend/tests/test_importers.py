"""Parser tests against small hand-built TCX / GPX / Apple Health fixtures."""

from __future__ import annotations

import io
import zipfile

import pytest

from app import importers

TCX_SAMPLE = b"""<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Running">
      <Id>2026-06-01T08:00:00Z</Id>
      <Lap StartTime="2026-06-01T08:00:00Z">
        <TotalTimeSeconds>1800</TotalTimeSeconds>
        <DistanceMeters>4828</DistanceMeters>
        <Calories>320</Calories>
        <AverageHeartRateBpm><Value>152</Value></AverageHeartRateBpm>
        <MaximumHeartRateBpm><Value>171</Value></MaximumHeartRateBpm>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>"""

GPX_SAMPLE = b"""<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk>
    <name>Morning Run</name>
    <type>running</type>
    <trkseg>
      <trkpt lat="40.0000" lon="-105.0000">
        <time>2026-06-01T08:00:00Z</time>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>140</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
      <trkpt lat="40.0100" lon="-105.0000">
        <time>2026-06-01T08:05:00Z</time>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>155</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
      <trkpt lat="40.0200" lon="-105.0000">
        <time>2026-06-01T08:10:00Z</time>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>160</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
    </trkseg>
  </trk>
</gpx>"""

APPLE_SAMPLE = b"""<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="en_US">
  <Workout workoutActivityType="HKWorkoutActivityTypeSoccer" duration="90"
           durationUnit="min" totalDistance="4.2" totalDistanceUnit="mi"
           totalEnergyBurned="700" totalEnergyBurnedUnit="Cal"
           startDate="2026-05-20 18:00:00 -0400" endDate="2026-05-20 19:30:00 -0400"/>
  <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="32.5"
           durationUnit="min" startDate="2026-05-22 07:00:00 -0400"
           endDate="2026-05-22 07:32:30 -0400">
    <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="4.1" unit="mi"/>
    <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="380" unit="Cal"/>
  </Workout>
</HealthData>"""


def test_parse_tcx():
    drafts = importers.parse_tcx(TCX_SAMPLE)
    assert len(drafts) == 1
    d = drafts[0]
    assert d["type"] == "Distance Run"
    assert d["date"] == "2026-06-01"
    assert d["duration_min"] == 30.0
    assert d["distance_mi"] == 3.0
    assert d["calories"] == 320
    assert d["metrics"]["avg_hr"] == 152
    assert d["metrics"]["max_hr"] == 171
    assert d["intensity"] == 6  # estimated from avg HR
    assert d["metrics"]["avg_pace"] == "10:00"


def test_parse_gpx():
    drafts = importers.parse_gpx(GPX_SAMPLE)
    assert len(drafts) == 1
    d = drafts[0]
    assert d["type"] == "Distance Run"
    assert d["title"] == "Morning Run"
    assert d["duration_min"] == 10.0
    assert 1.2 < d["distance_mi"] < 1.5  # ~0.02° latitude ≈ 1.38 mi
    assert d["metrics"]["avg_hr"] == round((140 + 155 + 160) / 3)


def test_parse_apple_health_attrs_and_statistics():
    drafts = importers.parse_apple_health(APPLE_SAMPLE)
    assert len(drafts) == 2
    # Sorted most-recent first.
    run, soccer = drafts
    assert run["type"] == "Distance Run"
    assert run["date"] == "2026-05-22"
    assert run["distance_mi"] == 4.1  # from WorkoutStatistics child
    assert run["calories"] == 380
    assert soccer["type"] == "Match"
    assert soccer["duration_min"] == 90


def test_parse_upload_dispatch_and_zip():
    assert importers.parse_upload("a.tcx", TCX_SAMPLE)["source"] == "tcx"
    assert importers.parse_upload("a.gpx", GPX_SAMPLE)["source"] == "gpx"
    # Content sniffing without a useful extension:
    assert importers.parse_upload("export.xml", APPLE_SAMPLE)["source"] == "apple_health"

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("apple_health_export/export.xml", APPLE_SAMPLE)
    result = importers.parse_upload("export.zip", buf.getvalue())
    assert result["source"] == "apple_health"
    assert len(result["workouts"]) == 2


def test_parse_upload_rejects_garbage():
    with pytest.raises(ValueError):
        importers.parse_upload("file.dat", b"not a workout file")
    with pytest.raises(ValueError):
        importers.parse_upload("empty.tcx", b"")
