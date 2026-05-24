export interface ResponseInput {
  matchedMembers: string[];
  intent: string;
  params: Record<string, string>;
}

export function generateResponse(input: ResponseInput): string {
  const { matchedMembers, intent, params } = input;
  const count = matchedMembers.length;
  const memberList = formatMemberList(matchedMembers);

  switch (intent) {
    case 'find':
      if (count === 0) return `No members found matching "${params.pattern}".`;
      return `Found ${count} member${count === 1 ? '' : 's'} matching "${params.pattern}": ${memberList}`;

    case 'count':
      if (params.dimension) {
        return `There are ${count} members in the ${params.dimension} dimension.`;
      }
      return `There are ${count} members total.`;

    case 'children':
      if (count === 0) return `No children found under "${params.parent}".`;
      return `${count} member${count === 1 ? '' : 's'} found under "${params.parent}": ${memberList}`;

    case 'missing_property': {
      const dimLabel = params.dimension ? `${params.dimension} ` : '';
      if (count === 0) return `All ${dimLabel}members have the "${params.property}" property.`;
      return `Found ${count} ${dimLabel}member${count === 1 ? '' : 's'} missing "${params.property}": ${memberList}`;
    }

    case 'property_filter':
      if (count === 0) return `No members found with ${params.property} = "${params.value}".`;
      return `Found ${count} member${count === 1 ? '' : 's'} with ${params.property} = "${params.value}": ${memberList}`;

    case 'orphans':
      if (count === 0) return `No orphan members found — all members are connected in the hierarchy.`;
      return `Found ${count} orphan member${count === 1 ? '' : 's'} (not in any hierarchy): ${memberList}`;

    default:
      if (count === 0) return `No results found.`;
      return `Found ${count} result${count === 1 ? '' : 's'}: ${memberList}`;
  }
}

function formatMemberList(members: string[]): string {
  if (members.length <= 10) {
    return members.join(', ');
  }
  return members.slice(0, 10).join(', ') + ` ...and ${members.length - 10} more`;
}
