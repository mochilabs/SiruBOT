import Container from "@/components/container";
import Loader from "@/components/loader";

export default function PlayerLoading() {
	return (
		<Container>
			<span role="status" className="sr-only">
				음악 플레이어를 불러오는 중…
			</span>
			<Loader fullPage />
		</Container>
	);
}
