import Container from "@/components/container";
import Loader from "@/components/loader";

export default function ContributorsLoading() {
	return (
		<Container>
			<span role="status" className="sr-only">
				기여자 목록을 불러오는 중…
			</span>
			<Loader fullPage />
		</Container>
	);
}
