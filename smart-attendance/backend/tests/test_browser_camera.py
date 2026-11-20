"""Live attendance with the camera of the device that opened the page."""
import time

from conftest import HERE
from test_api import register


def wait_for(client, auth, statuses, push=None, seconds=40):
    end = time.time() + seconds
    last = None
    while time.time() < end:
        if push:
            push()
        last = client.get("/api/camera-status", headers=auth).json
        if last["status"] in statuses:
            return last
        time.sleep(0.15)
    raise AssertionError(f"camera status stayed {last}")


def test_browser_camera_identifies_face_from_posted_frames(client, auth):
    import camera
    assert register(client, auth).status_code == 200
    r = client.post("/api/start-attendance", json={"source": "browser"}, headers=auth)
    assert r.status_code == 200 and r.json["frame_key"]
    key = r.json["frame_key"]
    jpeg = (HERE / "fixtures" / "face.jpg").read_bytes()
    try:
        # frames need the key handed to the device that started it
        bad = client.post("/api/camera-frame", data=jpeg, headers={**auth, "X-Frame-Key": "nope", "Content-Type": "image/jpeg"})
        assert bad.status_code == 403
        assert client.post("/api/camera-frame", data=b"not a jpeg",
                           headers={**auth, "X-Frame-Key": key, "Content-Type": "image/jpeg"}).status_code == 400
        assert client.post("/api/camera-frame", data=jpeg, headers={"X-Frame-Key": key}).status_code == 401   # login needed

        def push():
            client.post("/api/camera-frame", data=jpeg, headers={**auth, "X-Frame-Key": key, "Content-Type": "image/jpeg"})
        # the still photo is recognised, then asked to blink (a photo can't, so it is never marked)
        st = wait_for(client, auth, {"challenge", "error"}, push)
        assert st["status"] == "challenge", st
        assert st["camera"]["browser"] is True
    finally:
        assert client.post("/api/stop-attendance", headers=auth).status_code == 200
    assert camera.camera_state["browser"] is None and not camera.camera_state["active"]
    st = client.get("/api/camera-status", headers=auth).json
    assert st["status"] == "idle" and st["marked_count"] == 0
    # no session: frames are refused
    assert client.post("/api/camera-frame", data=jpeg, headers={**auth, "X-Frame-Key": key}).status_code == 409


def test_browser_camera_stops_when_frames_stop(client, auth, monkeypatch):
    import camera
    monkeypatch.setattr(camera, "BROWSER_FRAME_TIMEOUT", 1)
    register(client, auth)
    assert client.post("/api/start-attendance", json={"source": "browser"}, headers=auth).status_code == 200
    st = wait_for(client, auth, {"error"}, seconds=30)
    assert "stopped sending video" in st["message"]
    assert not camera.camera_state["active"]
