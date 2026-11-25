import type { Roadmap } from '@repo/schemas';
export interface EvalUserProfileFixture {
    id: string;
    fixture_name: string;
    domain_id: string;
    experience: Record<string, number | string>;
    roadmap: Roadmap;
}
export declare const USER_PROFILE_FIXTURES: Record<string, EvalUserProfileFixture>;
//# sourceMappingURL=user-profiles.d.ts.map