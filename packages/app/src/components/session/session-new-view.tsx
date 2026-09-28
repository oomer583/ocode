import { useLanguage } from "@/context/language"

const ROOT_CLASS = "size-full flex flex-col"

interface NewSessionViewProps {
  worktree: string
}

export function NewSessionView(_props: NewSessionViewProps) {
  const language = useLanguage()
  return (
    <div class={`${ROOT_CLASS} items-center justify-center px-8 text-center`}>
      <div class="max-w-[420px] text-12-regular leading-5 text-text-weak">{language.t("session.new.description")}</div>
    </div>
  )
}
