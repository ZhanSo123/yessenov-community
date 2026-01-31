"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Community = {
  id: number;
  slug: string;
  title: string;
  type: "OPEN" | "FACULTY" | "COURSE" | "TEACHERS";
  facultyCode?: string | null;
  courseYear?: number | null;
  isPrivate?: boolean;
};

type CommunityResponse = {
  data?: Community[];
};

const typeLabel = (community: Community) => {
  if (community.type === "FACULTY") return "Факультет";
  if (community.type === "COURSE") return "Курс";
  if (community.type === "TEACHERS") return "Преподаватели";
  return "Открытое";
};

export default function CommunitySwitcher() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/communities?scope=open", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as CommunityResponse;
        if (active) {
          setCommunities(payload.data ?? []);
        }
      } catch {
        if (active) {
          setCommunities([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      active = false;
    };
  }, []);

  if (loading || communities.length === 0) {
    return null;
  }

  const openOnly = communities.filter(
    (community) => community.type === "OPEN" && !community.isPrivate
  );

  if (openOnly.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Сообщества</h2>
        <Link
          href="/communities"
          className="text-xs text-slate-500 transition hover:text-slate-900"
        >
          Все →
        </Link>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {openOnly.map((community) => (
          <Link
            key={community.id}
            href={`/c/${community.slug}`}
            className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 transition hover:border-[#6495ED]/40 hover:text-[#6495ED]"
          >
            <span className="font-semibold">{community.title}</span>
            <span className="ml-1 text-[10px] text-slate-400">
              {typeLabel(community)}
              {community.facultyCode ? ` · ${community.facultyCode}` : ""}
              {community.courseYear ? ` · ${community.courseYear}` : ""}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
