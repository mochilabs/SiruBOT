import { AllFlowsPrecondition } from '@sapphire/framework';
import { appEmoji } from '@sirubot/utils';

export class NodeAvailable extends AllFlowsPrecondition {
	// 클래스 필드 대신 getter로 렌더 시점에 평가해야 앱 이모지 매핑이 반영돼요.
	get #message() {
		return `${appEmoji('bulb', '💡')} 현재 사용 가능한 노드가 없어요. 잠시 후 다시 시도해 주세요.`;
	}
	#ephemeral = true;

	public override chatInputRun() {
		return this.check();
	}

	public override contextMenuRun() {
		return this.check();
	}

	public override messageRun() {
		return this.check();
	}

	public check() {
		return this.container.audio.nodeManager.nodes.filter((node) => node.connected).size > 0 ? this.ok() : this.createError();
	}

	private createError() {
		return this.error({ message: this.#message, context: { ephemeral: this.#ephemeral } });
	}
}
