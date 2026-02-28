import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import type { DiscordGuild } from "@/types/discord";

async function getUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
  const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch guilds");
  }

  return res.json();
}

export default async function ServersPage() {
  const session = await auth();

  if (!session) {
    redirect("/api/auth/signin?callbackUrl=/servers");
  }

  const guilds = await getUserGuilds(session.accessToken!);

  // Filter guilds where user has MANAGE_GUILD (0x20) or ADMINISTRATOR (0x8)
  const manageableGuilds = guilds.filter((guild) => {
    const permissions = BigInt(guild.permissions);
    const manageGuild = BigInt(0x20);
    const administrator = BigInt(0x8);
    return (permissions & manageGuild) === manageGuild || (permissions & administrator) === administrator;
  });

  // TODO: Check against the database if the bot is actually in the server

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">서버 선택</h1>
          <p className="text-gray-600">설정할 서버를 선택해주세요.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">{session.user.name}</p>
            <p className="text-xs text-gray-500">{session.user.email}</p>
          </div>
          {session.user.image && (
            <Image
              src={session.user.image}
              alt="User Avatar"
              width={40}
              height={40}
              className="rounded-full"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {manageableGuilds.map((guild) => {
          const iconUrl = guild.icon
            ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`
            : null;

          return (
            <div
              key={guild.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="p-6 flex-grow">
                <div className="flex items-center gap-4 mb-4">
                  {iconUrl ? (
                    <Image
                      src={iconUrl}
                      alt={`${guild.name} icon`}
                      width={48}
                      height={48}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-semibold text-lg">
                      {guild.name.charAt(0)}
                    </div>
                  )}
                  <h3 className="font-semibold text-gray-900 line-clamp-2">
                    {guild.name}
                  </h3>
                </div>
              </div>
              <div className="bg-gray-50 px-6 py-4 mt-auto border-t border-gray-100">
                {/* For now we just show a placeholder manage button until we integrate bot detection */}
                <a
                  href={`/servers/${guild.id}`}
                  className="block w-full text-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                >
                  관리하기
                </a>
              </div>
            </div>
          );
        })}

        {manageableGuilds.length === 0 && (
          <div className="col-span-full text-center py-12 bg-white rounded-xl border border-gray-200 border-dashed">
            <p className="text-gray-500">관리할 수 있는 서버가 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
