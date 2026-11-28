"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BIRTHDAY_SETTINGS_DEFAULTS,
  type BirthdaySettings as BirthdaySettingsData,
  DEFAULT_BIRTHDAY_CARD,
} from "@sirubot/utils/birthdayCelebration";
import type { GreetingConfig } from "@sirubot/utils/memberGreeting";
import { Cake } from "lucide-react";
import useSWR from "swr";

import { RoleSelect } from "@/components/discord/role-select";
import { Field } from "@/components/primitives/field";
import { Card } from "@/components/ui/card";
import { TimePicker } from "@/components/ui/date-time-picker";
import { Tabs } from "@/components/ui/tabs";
import { useGuildChannels, useGuildRoles } from "@/hooks/use-guild-settings";
import { toApiError, toError } from "@/lib/api-error";
import { notifyApiError, notifySaved } from "@/lib/notify";
import { createApiFetcher } from "@/lib/swr";

import { GreetingSection } from "./member-greeting/greeting-section";
import { ChannelListError, InfoBox, PanelError, PanelHeader, PanelLoading, SaveBar } from "./settings-shared";

const fetcher = createApiFetcher<BirthdaySettingsData>("생일 축하 설정을 불러오지 못했어요.", { sessionRetry: true });

export function BirthdaySettings({
  guildId,
  visible,
  guildName,
}: {
  guildId: string;
  visible: boolean;
  guildName: string | null;
}) {
  const url = `/api/servers/${guildId}/birthday`;
  const { data, error, isLoading, mutate } = useSWR<BirthdaySettingsData>(url, fetcher);
  const { channels, error: channelsError, reload: reloadChannels } = useGuildChannels(guildId);
  const { roles } = useGuildRoles(guildId);

  const [card, setCard] = useState<GreetingConfig>(DEFAULT_BIRTHDAY_CARD);
  const [sendTime, setSendTime] = useState(BIRTHDAY_SETTINGS_DEFAULTS.sendTime);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data || touched) return;
    setCard(data.card);
    setSendTime(data.sendTime);
    setRoleId(data.roleId);
  }, [data, touched]);

  const dirty =
    data !== undefined &&
    (JSON.stringify(card) !== JSON.stringify(data.card) || sendTime !== data.sendTime || roleId !== data.roleId);

  const handleSave = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card, sendTime, roleId }),
      });
      if (!res.ok) throw await toApiError(res, "생일 축하 설정을 저장하지 못했어요.");
      const saved = (await res.json()) as BirthdaySettingsData;
      await mutate(saved, { revalidate: false });
      setTouched(false);
      notifySaved(
        "생일 축하 설정을 저장했어요.",
        saved.card.enabled && saved.activeFrom ? `${saved.activeFrom}부터 축하해요.` : undefined,
      );
      return true;
    } catch (err) {
      notifyApiError(err, "저장에 실패했어요.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [url, card, sendTime, roleId, mutate]);

  if (error) return <PanelError error={toError(error, "생일 축하 설정을 불러오지 못했어요.")} onRetry={() => void mutate()} />;
  if (isLoading || !data) return <PanelLoading label="생일 축하 설정 불러오는 중…" />;

  return (
    <Card padding="lg" className="gap-6 overflow-visible">
      <Tabs defaultValue="birthday" className="contents">
        <PanelHeader
          icon={<Cake className="h-5 w-5" />}
          title="생일 축하"
          description="생일 축하를 켠 멤버를 매일 정해진 시각에 카드와 함께 축하해요."
        />

        {channelsError && <ChannelListError error={channelsError} onRetry={reloadChannels} />}

        <GreetingSection
          asTabContent="birthday"
          kind="birthday"
          guildId={guildId}
          visible={visible}
          guildName={guildName}
          draft={card}
          saved={data.card}
          dirty={dirty}
          channels={channels}
          saving={saving}
          onPatch={(next) => {
            setTouched(true);
            setCard(next);
          }}
          onReset={() => {
            setTouched(true);
            setCard({ ...DEFAULT_BIRTHDAY_CARD, enabled: card.enabled, channelId: card.channelId });
          }}
        />

        <section className="min-w-0 space-y-5 border-t border-border pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="보내는 시각 (한국 시간)" description="매일 이 시각에 그날 생일인 멤버를 모아서 한 번에 축하해요. 기본 09:00">
              {({ id, describedBy }) => (
                <TimePicker
                  id={id}
                  aria-describedby={describedBy}
                  value={sendTime}
                  disabled={saving}
                  onChange={(next) => {
                    setTouched(true);
                    setSendTime(next);
                  }}
                />
              )}
            </Field>
            <Field
              label="생일 역할 (선택)"
              description="생일 당일 줄 역할이에요. 다음 날 자동으로 거둬요. 봇 역할이 이 역할보다 위에 있어야 해요."
            >
              <RoleSelect
                roles={roles}
                noneLabel="역할을 주지 않아요"
                value={roleId ?? ""}
                disabled={saving}
                placeholder="역할을 선택해 주세요"
                onChange={(value) => {
                  setTouched(true);
                  setRoleId(value === "" ? null : value);
                }}
              />
            </Field>
          </div>
        </section>
      </Tabs>

      <InfoBox>
        <p>
          멤버가 <strong>/프로필 생일축하</strong> 또는 내 프로필 페이지에서 이 서버의 축하를 켠 경우에만 축하해요. 새로 켠 서버는 다음 날부터 시작하고,
          2월 29일생은 평년에 2월 28일에 축하해요. 서버를 나간 멤버는 건너뛰어요.
        </p>
      </InfoBox>

      <SaveBar dirty={dirty} saving={saving} onSave={handleSave} />
    </Card>
  );
}
