import { RequireUser } from "../components/ui";
import { CompanionWizard } from "../components/CompanionWizard";
export default function Create() {
  return (
    <RequireUser>
      <CompanionWizard />
    </RequireUser>
  );
}
