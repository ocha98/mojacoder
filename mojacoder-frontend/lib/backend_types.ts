import { JudgeStatusDetail } from '../lib/JudgeStatus'

export interface Connection<T> {
    items: T[]
    nextToken: string
}

export interface Problem {
    id: string
    title: string
    user: User
    statement
    submission: Submission | null
    submissions: Connection<Submission>
}

export const SubmissionStatus = {
    WJ: 'WJ',
    CE: 'CE',
    JUDGED: 'JUDGED',
} as const
export type SubmissionStatus = typeof SubmissionStatus[keyof typeof SubmissionStatus]

export interface Submission {
    id: string
    problemID: string
    user: User
    datetime: string
    lang: string
    status: SubmissionStatus
    code: string
    stderr: string
    testcases: JudgeStatusDetail[]
}

export interface User {
    userID: string
    detail: UserDetail
}

export interface UserDetail {
    userID: string | null
    screenName: string | null
    problem: Problem | null
    problems: Connection<Problem>
}
