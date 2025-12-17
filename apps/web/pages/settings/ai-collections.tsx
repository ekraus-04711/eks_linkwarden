import SettingsLayout from "@/layouts/SettingsLayout";
import { useEffect, useState } from "react";
import { useTranslation } from "next-i18next";
import getServerSideProps from "@/lib/client/getServerSideProps";
import { Separator } from "@/components/ui/separator";
import Checkbox from "@/components/Checkbox";
import { Button } from "@/components/ui/button";
import { toast } from "react-hot-toast";
import { useConfig } from "@linkwarden/router/config";
import { useUpdateUser, useUser } from "@linkwarden/router/user";

export default function AiCollectionsSettings() {
  const { t } = useTranslation();
  const { data: config } = useConfig();
  const { data: user } = useUser();
  const updateUser = useUpdateUser();

  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    setEnabled(user?.aiCollectionsEnabled ?? false);
  }, [user?.aiCollectionsEnabled]);

  const savePreference = async () => {
    if (!user) return;

    setSaving(true);
    const load = toast.loading(t("applying_settings"));

    try {
      await updateUser.mutateAsync({ ...user, aiCollectionsEnabled: enabled });
      toast.success(t("settings_applied"));
    } catch (error: any) {
      toast.error(error.message || t("something_went_wrong"));
    } finally {
      setSaving(false);
      toast.dismiss(load);
    }
  };

  const assignExistingLinks = async () => {
    setAssigning(true);
    const load = toast.loading(t("ai_collection_assigning"));

    try {
      const response = await fetch("/api/v1/collections/ai-assign", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.response);

      toast.success(
        t("ai_collection_assigning_done", { count: data.response.processed })
      );
    } catch (error: any) {
      toast.error(error.message || t("ai_collection_assigning_error"));
    } finally {
      setAssigning(false);
      toast.dismiss(load);
    }
  };

  return (
    <SettingsLayout>
      <div className="flex flex-col gap-4">
        <div>
          <p className="capitalize text-3xl font-thin inline">
            {t("ai_collection_routing")}
          </p>
          <Separator className="my-3" />
          <p className="text-sm text-neutral">
            {t("ai_collection_routing_description")}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Checkbox
            label={t("ai_collection_routing_toggle")}
            state={enabled}
            onClick={() => setEnabled((prev) => !prev)}
            disabled={!config?.AI_ENABLED}
          />
          {!config?.AI_ENABLED && (
            <p className="text-xs text-warning">
              {t("ai_disabled_warning")}
            </p>
          )}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={savePreference}
              disabled={saving || !user}
            >
              {saving ? t("saving") : t("save")}
            </Button>
            <Button
              variant="default"
              onClick={assignExistingLinks}
              disabled={assigning || !enabled}
            >
              {assigning ? t("ai_collection_assigning") : t("run_now")}
            </Button>
          </div>
          <p className="text-sm text-neutral">
            {t("ai_collection_assigning_hint")}
          </p>
        </div>
      </div>
    </SettingsLayout>
  );
}

export { getServerSideProps };
