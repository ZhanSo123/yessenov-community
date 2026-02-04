"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useI18n } from "@/lib/i18n/useI18n";

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

export default function CommunitySwitcher() {
  const { t } = useI18n();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const typeLabel = (community: Community) => {
    if (community.type === "FACULTY") return t("community.type.faculty");
    if (community.type === "COURSE") return t("community.type.course");
    if (community.type === "TEACHERS") return t("community.type.teachers");
    return t("community.type.open");
  };

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
    <section className="rounded-3xl p-4 bubble-surface">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">
          {t("community.switcher.title")}
        </h2>
        <Link
          href="/communities"
          className="text-xs text-slate-500 transition hover:text-slate-900"
        >
          {t("community.switcher.all")}
        </Link>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {openOnly.map((community) => (
          <Link
            key={community.id}
            href={`/c/${community.slug}`}
            className="shrink-0 rounded-full px-3 py-2 text-xs transition bubble-chip hover:text-slate-900"
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
