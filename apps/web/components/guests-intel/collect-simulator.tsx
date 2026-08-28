"use client";

import {
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { DevicePreviewChrome } from "@/components/simulators/device-preview-chrome";
import { DevicePreviewStage } from "@/components/simulators/device-preview-stage";
import { GuestFormFields } from "@/components/guests-intel/guest-form-fields";
import { PassCard } from "@/components/guests-intel/pass-card";
import {
  CollectPathPanel,
  type CollectSimPageId,
} from "@/components/guests-intel/collect-path-panel";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { submitHubGuestForm } from "@/lib/actions/guests-intel";
import {
  guestFormPath,
  type GuestsIntelReward,
  type IssuedPassView,
} from "@/lib/guests-intel/types";
import {
  DEFAULT_DEVICE_ID,
  DEVICE_BRANDS,
  deviceRatioLabel,
  devicesForBrand,
  getDevicePreset,
  type DeviceBrand,
} from "@/lib/mobile/device-presets";

const BEZEL = 14;
const HOME_BUTTON_EXTRA = 52;

export function CollectSimulator({
  rewards,
  defaultRewardId,
  canEdit,
  thankYou,
  publicToken,
  themeStyle,
}: {
  rewards: GuestsIntelReward[];
  defaultRewardId: string | null;
  canEdit: boolean;
  thankYou: string;
  publicToken: string | null;
  themeStyle: CSSProperties;
}) {
  const [deviceId, setDeviceId] = useState(DEFAULT_DEVICE_ID);
  const device = getDevicePreset(deviceId);
  const brand = device.brand;
  const brandDevices = useMemo(() => devicesForBrand(brand), [brand]);
  const extraBottom = device.island === "home-button" ? HOME_BUTTON_EXTRA : 0;
  const frameWidth = device.width + BEZEL * 2;
  const frameHeight = device.height + BEZEL * 2 + extraBottom;
  const screenRadius = device.island === "home-button" ? 4 : device.cornerRadius;
  const bodyRadius = device.island === "home-button" ? 36 : screenRadius + BEZEL;
  const ratio = deviceRatioLabel(device.width, device.height);
  const [pageId, setPageId] = useState<CollectSimPageId>("form");
  const [pending, startTransition] = useTransition();
  const [pass, setPass] = useState<IssuedPassView | null>(null);
  const previewPath =
    pageId === "pass" && pass
      ? pass.passPath
      : publicToken
        ? guestFormPath(publicToken)
        : "/g";

  function selectBrand(next: DeviceBrand) {
    if (next === brand) return;
    const first = devicesForBrand(next)[0];
    if (first) setDeviceId(first.id);
  }

  function showForm() {
    setPass(null);
    setPageId("form");
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <DevicePreviewChrome
        intro="Collect details at the table or host stand on a phone, then show the guest their pass QR."
        formatValue={brand}
        formatOptions={DEVICE_BRANDS.map((item) => ({
          value: item.key,
          label: item.label,
        }))}
        onFormatChange={(value) => selectBrand(value as DeviceBrand)}
        modelValue={deviceId}
        modelOptions={brandDevices.map((item) => ({
          value: item.id,
          label: item.label,
        }))}
        onModelChange={setDeviceId}
        spec={`${device.label} · ${device.width} × ${device.height} · ${ratio} · ${device.dpr}×`}
        previewPath={previewPath}
      />
      <DevicePreviewStage
        frameWidth={frameWidth}
        frameHeight={frameHeight}
        panel={<CollectPathPanel selectedId={pageId} onSelect={setPageId} />}
      >
        <div
          className="relative h-full w-full"
          style={{
            padding: BEZEL,
            paddingBottom: BEZEL + extraBottom,
            borderRadius: bodyRadius,
            background:
              brand === "iphone"
                ? "linear-gradient(160deg, #3a3a3c 0%, #1c1c1e 42%, #111113 100%)"
                : "linear-gradient(160deg, #2b2b2b 0%, #141414 48%, #0c0c0c 100%)",
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.18) inset, 0 24px 48px -20px rgba(0,0,0,0.45), 0 8px 16px -8px rgba(0,0,0,0.3)",
          }}
          aria-label={`${device.label} simulation, ${deviceRatioLabel(device.width, device.height)}`}
        >
          <div
            className="relative h-full w-full overflow-hidden"
            style={{
              borderRadius: screenRadius,
              ...themeStyle,
              backgroundColor:
                "color-mix(in srgb, var(--venue-secondary, #F0F3DD) 35%, white)",
            }}
          >
            {device.island === "dynamic-island" ? (
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black"
                style={{ width: 126, height: 37 }}
              />
            ) : null}
            {device.island === "punch-hole" ? (
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-3 z-10 h-3 w-3 -translate-x-1/2 rounded-full bg-black"
              />
            ) : null}
            <div className="h-full overflow-y-auto pt-10">
              <div className="mx-auto w-full max-w-md space-y-4 px-4 py-8">
                {pageId === "pass" && pass ? (
                  <div className="space-y-4">
                    <PassCard
                      pass={pass}
                      thankYou={thankYou}
                      allowResend={canEdit}
                      compact
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      onClick={showForm}
                    >
                      Collect another guest
                    </Button>
                  </div>
                ) : pageId === "pass" ? (
                  <div className="rounded-2xl border border-black/8 bg-white/80 px-5 py-8 text-center shadow-sm">
                    <p className="font-serif text-2xl text-[#3D421F]">
                      Guest pass
                    </p>
                    <p className="mt-2 text-sm text-black/55">
                      Save the form first to issue a pass QR for this guest.
                    </p>
                    <Button
                      type="button"
                      className="mt-5 w-full"
                      onClick={() => setPageId("form")}
                    >
                      Open guest form
                    </Button>
                  </div>
                ) : (
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!canEdit) return;
                      const formData = new FormData(event.currentTarget);
                      startTransition(async () => {
                        const result = await submitHubGuestForm(formData);
                        if (!result.ok) {
                          toast.error(result.error);
                          return;
                        }
                        setPass(result.pass);
                        setPageId("pass");
                        if (result.pass.emailSent) {
                          toast.saved(`Pass emailed to ${result.pass.email}.`);
                        } else {
                          toast.alert(
                            result.pass.emailError ??
                              "Guest saved. Email could not be sent.",
                          );
                        }
                      });
                    }}
                  >
                    <div className="space-y-0.5 text-center">
                      <h1 className="font-serif text-[1.7rem] leading-tight text-[#3D421F]">
                        Fill in the hub
                      </h1>
                      <p className="text-sm leading-snug text-black/55">
                        Collect details, then show the guest their pass.
                      </p>
                    </div>
                    <div className="space-y-4 rounded-2xl border border-black/8 bg-white/80 p-4 shadow-sm">
                      <GuestFormFields
                        defaultRewardId={defaultRewardId}
                        disabled={!canEdit || pending}
                        idPrefix="hub-guest"
                      />
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={!canEdit || pending || rewards.length === 0}
                      >
                        {pending ? "Issuing pass…" : "Save and issue pass"}
                      </Button>
                      {rewards.length === 0 ? (
                        <p className="text-sm text-[#b23b2e]">
                          Add an active reward before collecting guests.
                        </p>
                      ) : null}
                      {!canEdit ? (
                        <p className="text-sm text-black/45">
                          You can view this page, but issuing a pass needs
                          Collect editor access.
                        </p>
                      ) : null}
                    </div>
                  </form>
                )}
              </div>
            </div>
            {device.island !== "home-button" ? (
              <div
                aria-hidden
                className="pointer-events-none absolute bottom-2 left-1/2 z-10 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-black/35"
              />
            ) : null}
          </div>
          {device.island === "home-button" ? (
            <div
              aria-hidden
              className="absolute bottom-[11px] left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border-2 border-white/15"
            >
              <span className="h-7 w-7 rounded-full border border-white/20" />
            </div>
          ) : null}
        </div>
      </DevicePreviewStage>
    </div>
  );
}
