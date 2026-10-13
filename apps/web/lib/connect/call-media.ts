import { MediaDeviceFailure } from "livekit-client";

type DeviceKind = "audioinput" | "videoinput" | "audiooutput";

const NAMES: Record<DeviceKind, string> = {
  audioinput: "microphone",
  videoinput: "camera",
  audiooutput: "speaker",
};

/** A plain-language reason a camera / microphone couldn't start. */
export function describeMediaFailure(failure: MediaDeviceFailure | undefined, kind?: MediaDeviceKind): string {
  const device = kind && kind in NAMES ? NAMES[kind as DeviceKind] : "camera or microphone";
  switch (failure) {
    case MediaDeviceFailure.PermissionDenied:
      return `Ops Hub isn't allowed to use your ${device}. Allow it in the browser's site settings (or System Settings › Privacy & Security for the installed app), then try again.`;
    case MediaDeviceFailure.NotFound:
      return `No ${device} found. Check it's connected, or pick another in call settings.`;
    case MediaDeviceFailure.DeviceInUse:
      return `Your ${device} is busy in another app (FaceTime, Zoom, Teams…). Close it there and try again.`;
    default:
      return `Couldn't start your ${device}.`;
  }
}

export function describeMediaError(error: unknown, kind?: MediaDeviceKind): string {
  return describeMediaFailure(MediaDeviceFailure.getFailure(error), kind);
}
