import Link from "next/link";
import { privacyConsentField, privacyPolicyPath } from "@/lib/privacy-policy";

type PersonalDataConsentProps = {
  disabled?: boolean;
  id?: string;
};

export function PersonalDataConsent({ disabled = false, id = "privacy-consent" }: PersonalDataConsentProps) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-surface/60 p-3">
      <input
        id={id}
        name={privacyConsentField}
        type="checkbox"
        required
        disabled={disabled}
        className="focus-ring mt-0.5 h-4 w-4 shrink-0 rounded border-border bg-background text-primary accent-primary"
      />
      <span className="text-sm leading-6 text-muted">
        Я даю своё согласие на обработку моих персональных данных в соответствии с{" "}
        <Link href={privacyPolicyPath} className="font-medium text-primary underline-offset-2 hover:underline">
          Политикой обработки персональных данных
        </Link>
        .
      </span>
    </label>
  );
}