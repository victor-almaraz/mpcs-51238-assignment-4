// Campaign editor (app-flow.md, Campaign editor): tabs Details, Materials, Members, Invitations; Archive
// campaign at the bottom of Details. Author only; others get the 404 page.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { MaterialPicker } from "@/components/campaign-materials";
import { CopyButton, InviteForm } from "@/components/invite-form";
import { getCampaign } from "@/lib/api/campaigns";
import { listInvitations } from "@/lib/api/invitations";
import { listMaterials } from "@/lib/api/materials";
import { systemView } from "@/lib/api/systems";
import {
  archiveCampaignAction,
  disableInviteLinkAction,
  removeMemberAction,
  revokeInvitationAction,
  rotateInviteLinkAction,
  setMaterialsAction,
  updateCampaignAction,
} from "@/lib/server/campaign-actions";
import { orNotFound, origin } from "@/lib/server/pages";
import { pageUser } from "@/lib/server/session";
import { serverStore } from "@/lib/server/supabase";

const TABS = ["details", "materials", "members", "invitations"] as const;
const field = "rounded-control border border-border bg-page px-2 py-1 font-prose text-prose";
const primary = "rounded-control bg-accent px-4 py-2 font-ui text-control text-page";
const quiet = "font-ui text-control text-accent";

export default async function EditCampaign({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const requested = (await searchParams).tab;
  const tab = TABS.find((t) => t === requested) ?? "details";
  const user = await pageUser();
  const store = serverStore();
  const campaign = await orNotFound(getCampaign(store, user.id, id));
  if (campaign.author_id !== user.id || !("invite_link_code" in campaign)) notFound();
  const system = systemView(campaign.system);

  return (
    <div className="mx-auto max-w-page px-6 py-10">
      <Link href={`/campaigns/${campaign.id}`} className="font-ui text-caption text-muted">
        {campaign.title}
      </Link>
      <h1 className="font-display text-title">Edit campaign</h1>
      <nav className="mt-4 flex gap-4 font-ui text-control">
        {TABS.map((t) => (
          <Link key={t} href={`?tab=${t}`} aria-current={t === tab ? "page" : undefined} className={t === tab ? "border-b-2 border-accent" : "text-muted"}>
            {t[0]!.toUpperCase() + t.slice(1)}
          </Link>
        ))}
      </nav>

      {tab === "details" && (
        <>
          <ActionForm action={updateCampaignAction} className="mt-6 flex flex-col gap-4">
            <input type="hidden" name="campaign_id" value={campaign.id} />
            <label className="flex flex-col gap-1">
              <span className="font-ui text-label">Title</span>
              <input name="title" required maxLength={80} defaultValue={campaign.title} className={field} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-ui text-label">Description</span>
              <textarea name="description" maxLength={2000} rows={4} defaultValue={campaign.description} className={field} />
            </label>
            <p className="font-ui text-label">
              System: {system.title} {campaign.system_versions}
            </p>
            {system.modules.length > 0 && (
              <fieldset>
                <legend className="font-ui text-label">Modules, for instances created from now on</legend>
                {system.modules.map((m) => (
                  <label key={m.id} className="flex items-baseline gap-2">
                    <input type="checkbox" name="modules" value={m.id} defaultChecked={campaign.modules.includes(m.id)} />
                    <span>{m.title}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <div>
              <button type="submit" className={primary}>
                Save
              </button>
            </div>
          </ActionForm>
          {!campaign.archived && (
            <ActionForm action={archiveCampaignAction} className="mt-10 border-t border-rule pt-4">
              <input type="hidden" name="campaign_id" value={campaign.id} />
              <p className="text-muted">An archived campaign accepts no new instances, members, or invitations.</p>
              <button type="submit" className="mt-2 rounded-control border border-danger px-4 py-2 font-ui text-control text-danger">
                Archive campaign
              </button>
            </ActionForm>
          )}
        </>
      )}

      {tab === "materials" && (
        <ActionForm action={setMaterialsAction} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="campaign_id" value={campaign.id} />
          <p className="text-muted">Changes apply to instances created from now on; existing instances keep their versions.</p>
          <MaterialPicker materials={await listMaterials(store, user.id, { system: campaign.system })} modules={[]} chosen={campaign.materials} enabled={campaign.modules} />
          <div>
            <button type="submit" className={primary}>
              Save materials
            </button>
          </div>
        </ActionForm>
      )}

      {tab === "members" && (
        <ul className="mt-6">
          {campaign.members.map((m) => (
            <li key={m.user_id} className="flex items-baseline justify-between border-b border-rule py-1">
              <span>
                {m.display_name} <span className="font-ui text-caption text-muted">{m.role}</span>
              </span>
              {m.role === "player" && (
                <ActionForm action={removeMemberAction}>
                  <input type="hidden" name="campaign_id" value={campaign.id} />
                  <input type="hidden" name="user_id" value={m.user_id} />
                  <button type="submit" className="font-ui text-control text-danger">
                    Remove
                  </button>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      )}

      {tab === "invitations" && (
        <div className="mt-6 flex flex-col gap-8">
          {campaign.archived ? <p className="text-muted">The campaign is archived.</p> : <InviteForm campaignId={campaign.id} origin={await origin()} />}
          <section>
            <h2 className="font-display text-heading">Pending invitations</h2>
            <PendingInvitations campaignId={campaign.id} userId={user.id} />
          </section>
          <section>
            <h2 className="font-display text-heading">Invite link</h2>
            {campaign.invite_link_code ? (
              <div className="mt-2 flex flex-wrap items-baseline gap-4">
                <span className="font-mono text-code">{campaign.invite_link_code}</span>
                <CopyButton text={`${await origin()}/join/${campaign.invite_link_code}`} label="Copy link" />
                <LinkAction action={rotateInviteLinkAction} campaignId={campaign.id} label="Rotate" />
                <LinkAction action={disableInviteLinkAction} campaignId={campaign.id} label="Disable" />
              </div>
            ) : (
              <div className="mt-2">
                <p className="text-muted">Link joining is off. Anyone with an enabled link can join.</p>
                {!campaign.archived && <LinkAction action={rotateInviteLinkAction} campaignId={campaign.id} label="Enable invite link" />}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function LinkAction({ action, campaignId, label }: { action: typeof rotateInviteLinkAction; campaignId: string; label: string }) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="campaign_id" value={campaignId} />
      <button type="submit" className={quiet}>
        {label}
      </button>
    </ActionForm>
  );
}

async function PendingInvitations({ campaignId, userId }: { campaignId: string; userId: string }) {
  const pending = await listInvitations(serverStore(), userId, { campaign_id: campaignId, status: "pending" });
  if (pending.length === 0) return <p className="mt-2 text-muted">None.</p>;
  return (
    <ul className="mt-2">
      {pending.map((i) => (
        <li key={i.id} className="flex items-baseline justify-between border-b border-rule py-1">
          <span>
            {i.note || "No note"}{" "}
            <span className="font-ui text-caption text-muted">
              by {i.inviter.display_name}, expires {new Date(i.expires_at).toUTCString().slice(5, 16)}
            </span>
          </span>
          <ActionForm action={revokeInvitationAction}>
            <input type="hidden" name="campaign_id" value={campaignId} />
            <input type="hidden" name="invitation_id" value={i.id} />
            <button type="submit" className="font-ui text-control text-danger">
              Revoke
            </button>
          </ActionForm>
        </li>
      ))}
    </ul>
  );
}
