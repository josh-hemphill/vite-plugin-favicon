test('Couldn\'t find anything to test, so... I guess just NO-op',()=>{
	const x = () => console.log('success? ...');
	const y = jest.fn(x);
	y();
	expect(y).toBeCalled();
});
