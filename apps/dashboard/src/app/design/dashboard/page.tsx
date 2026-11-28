import { notFound } from "next/navigation";

import Container from "@/components/container";
import { ServerDashboard } from "@/components/servers/server-dashboard";
import { ServerSwitcher } from "@/components/servers/server-switcher";
import { STUB_GUILD_ID } from "@/lib/stub/guild-stub";

import { StubGate } from "./stub-gate";

export default function DashboardLayoutPreview() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <Container>
      <StubGate>
        <h1 className="sr-only">데모 서버</h1>
        <ServerDashboard
          guildId={STUB_GUILD_ID}
          manageable
          guildName="데모 서버"
          switcher={
            <ServerSwitcher
              variant="sidebar"
              guildId={STUB_GUILD_ID}
              guildName="데모 서버"
              icon={null}
            />
          }
          mobileSwitcher={
            <ServerSwitcher
              variant="compact"
              guildId={STUB_GUILD_ID}
              guildName="데모 서버"
              icon={null}
            />
          }
        />
      </StubGate>
    </Container>
  );
}
